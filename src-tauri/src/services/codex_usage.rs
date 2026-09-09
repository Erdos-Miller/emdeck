use crate::services::{
    agent_usage::{now, LimitWindow},
    workspace::{err, Result},
};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountUsage {
    pub source: String,
    pub updated_at: u64,
    pub limits: Vec<LimitWindow>,
}
#[derive(Default)]
pub struct UsageCache(Mutex<Option<(Instant, AccountUsage)>>);
impl UsageCache {
    pub fn read(&self) -> Result<AccountUsage> {
        let mut cache = self.0.lock().map_err(err)?;
        if let Some((at, value)) = cache.as_ref() {
            if at.elapsed() < Duration::from_secs(30) {
                return Ok(value.clone());
            }
        }
        let result = read_limits()?;
        *cache = Some((Instant::now(), result.clone()));
        Ok(result)
    }
}
fn binary() -> Result<PathBuf> {
    let os = if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    };
    let triple = match (os, arch) {
        ("win32", "arm64") => "aarch64-pc-windows-msvc",
        ("win32", _) => "x86_64-pc-windows-msvc",
        ("darwin", "arm64") => "aarch64-apple-darwin",
        ("darwin", _) => "x86_64-apple-darwin",
        (_, "arm64") => "aarch64-unknown-linux-musl",
        _ => "x86_64-unknown-linux-musl",
    };
    let name = if cfg!(windows) { "codex.exe" } else { "codex" };
    for dir in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
        .filter(|p| p.is_absolute())
    {
        let direct = dir.join(name);
        if direct.is_file() {
            // npm's Unix shim is a JS script; use its vendor binary below.
            let resolved = direct.canonicalize().map_err(err)?;
            if !resolved
                .extension()
                .is_some_and(|e| e == "js" || e == "mjs")
            {
                return Ok(resolved);
            }
        }
        let packages = [
            dir.join("node_modules/@openai/codex"),
            dir.join("../lib/node_modules/@openai/codex"),
        ];
        for package in packages {
            for vendor in [
                package.join("vendor"),
                package.join(format!("node_modules/@openai/codex-{os}-{arch}/vendor")),
            ] {
                for folder in ["bin", "codex"] {
                    let candidate = vendor.join(triple).join(folder).join(name);
                    if candidate.is_file() {
                        return candidate.canonicalize().map_err(err);
                    }
                }
            }
        }
    }
    Err(
        "Codex executable was not found on PATH. Install or update Codex CLI, then restart Emdeck."
            .into(),
    )
}
fn windows(value: &Value) -> Vec<LimitWindow> {
    let snapshots: Vec<(&str, &Value)> = if let Some(map) = value["rateLimitsByLimitId"]
        .as_object()
        .filter(|m| !m.is_empty())
    {
        map.iter().map(|(k, v)| (k.as_str(), v)).collect()
    } else {
        vec![("Codex", &value["rateLimits"])]
    };
    snapshots
        .into_iter()
        .flat_map(|(key, snapshot)| {
            let name = snapshot["limitName"].as_str().unwrap_or(key);
            ["primary", "secondary"]
                .into_iter()
                .filter_map(move |kind| {
                    let v = &snapshot[kind];
                    let used = v["usedPercent"]
                        .as_f64()
                        .filter(|n| n.is_finite() && *n >= 0.0)?;
                    let duration = v["windowDurationMins"]
                        .as_u64()
                        .map(|m| {
                            if m % 1440 == 0 {
                                format!("{}d", m / 1440)
                            } else if m % 60 == 0 {
                                format!("{}h", m / 60)
                            } else {
                                format!("{m}m")
                            }
                        })
                        .unwrap_or_else(|| kind.into());
                    Some(LimitWindow {
                        label: format!("{name} · {duration}"),
                        used_percent: used,
                        resets_at: v["resetsAt"].as_u64(),
                    })
                })
        })
        .collect()
}
fn read_limits() -> Result<AccountUsage> {
    let temp = tempfile::Builder::new()
        .prefix("emdeck-codex-usage-")
        .tempdir()
        .map_err(err)?;
    let mut command = Command::new(binary()?);
    command
        .arg("app-server")
        .current_dir(temp.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(err)?;
    let mut input = child.stdin.take().ok_or("Codex stdin unavailable")?;
    let output = child.stdout.take().ok_or("Codex stdout unavailable")?;
    let (tx, rx) = mpsc::sync_channel(16);
    let reader = std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        loop {
            let mut line = Vec::new();
            if reader
                .by_ref()
                .take(262_145)
                .read_until(b'\n', &mut line)
                .ok()
                .is_none_or(|n| n == 0 || n > 262_144)
            {
                break;
            }
            if let Ok(message) = serde_json::from_slice::<Value>(&line) {
                if message["id"].is_number() && tx.send(message).is_err() {
                    break;
                }
            }
        }
    });
    let result = (|| {
        writeln!(input, "{}", json!({"method":"initialize", "id":0, "params":{"clientInfo":{"name":"emdeck_usage", "title":"Emdeck usage", "version":env!("CARGO_PKG_VERSION")}}})).map_err(err)?;
        input.flush().map_err(err)?;
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            let message = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())).map_err(|_| "Codex usage request timed out. Check that Codex CLI is signed in and try again.")?;
            if !message["error"].is_null() {
                return Err(message["error"]["message"]
                    .as_str()
                    .unwrap_or("Codex could not read account limits.")
                    .into());
            }
            if message["id"] == 0 {
                writeln!(input, "{}", json!({"method":"initialized","params":{}})).map_err(err)?;
                writeln!(
                    input,
                    "{}",
                    json!({"method":"account/rateLimits/read","id":1})
                )
                .map_err(err)?;
                input.flush().map_err(err)?;
            } else if message["id"] == 1 {
                return Ok(AccountUsage {
                    source: "Codex CLI account".into(),
                    updated_at: now(),
                    limits: windows(&message["result"]),
                });
            }
        }
    })();
    drop(input);
    drop(rx);
    let _ = child.kill();
    let _ = child.wait();
    let _ = reader.join();
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires an installed, signed-in Codex CLI; reads account quotas only"]
    fn installed_cli_limits_roundtrip() {
        let result = read_limits().unwrap();
        assert_eq!(result.source, "Codex CLI account");
        assert!(result.updated_at > 0);
    }
    #[test]
    fn multi_bucket_limits_keep_zero_missing_and_reset_semantics() {
        let value = json!({"rateLimits":{"primary":{"usedPercent":90}}, "rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":0,"windowDurationMins":300,"resetsAt":123},"secondary":null},"other":{"limitName":"Other model", "secondary":{"usedPercent":25,"windowDurationMins":10080}}}});
        let windows = windows(&value);
        assert_eq!(windows.len(), 2);
        assert_eq!(windows[0].used_percent, 0.0);
        assert_eq!(windows[0].resets_at, Some(123));
        assert_eq!(windows[1].resets_at, None);
        assert!(super::windows(&json!({})).is_empty());
    }
}
