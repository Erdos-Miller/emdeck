use crate::{error, terminal::now, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const MAX_LIMITS: usize = 12;
const MAX_TEXT: usize = 160;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub label: String,
    pub used_percent: f64,
    pub resets_at: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub source: String,
    pub updated_at: u64,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub context_size: Option<u64>,
    pub context_percent: Option<f64>,
    pub cost_usd: Option<f64>,
    pub limits: Vec<LimitWindow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountUsage {
    pub source: String,
    pub updated_at: u64,
    pub limits: Vec<LimitWindow>,
}

fn number(value: &Value) -> Option<f64> {
    value.as_f64().filter(|v| v.is_finite() && *v >= 0.0)
}

fn text(value: &Value) -> Option<String> {
    value.as_str().map(clamp)
}

fn clamp(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_TEXT)
        .collect()
}

pub fn claude_usage(value: &Value) -> Usage {
    let limits = [
        ("five_hour", "5-hour"),
        ("seven_day", "7-day"),
        ("spend_limit", "Spend limit"),
    ]
    .into_iter()
    .filter_map(|(key, label)| {
        let item = &value["rate_limits"][key];
        Some(LimitWindow {
            label: label.into(),
            used_percent: number(&item["used_percentage"])?,
            resets_at: item["resets_at"].as_u64(),
        })
    })
    .collect();
    Usage {
        source: "Claude status line".into(),
        updated_at: now(),
        model: text(&value["model"]["display_name"]).or_else(|| text(&value["model"]["id"])),
        session_id: text(&value["session_id"]),
        input_tokens: value["context_window"]["total_input_tokens"].as_u64(),
        output_tokens: value["context_window"]["total_output_tokens"].as_u64(),
        context_size: value["context_window"]["context_window_size"].as_u64(),
        context_percent: number(&value["context_window"]["used_percentage"])
            .filter(|p| *p <= 100.0),
        cost_usd: number(&value["cost"]["total_cost_usd"]),
        limits,
    }
}

// Anything running inside a pane can call the reporting CLI, so the server bounds
// the report instead of trusting the sender.
pub fn sanitize(usage: Usage) -> Usage {
    Usage {
        source: clamp(&usage.source),
        updated_at: now(),
        model: usage.model.as_deref().map(clamp),
        session_id: usage.session_id.as_deref().map(clamp),
        context_percent: usage.context_percent.filter(|p| p.is_finite() && *p >= 0.0),
        cost_usd: usage.cost_usd.filter(|c| c.is_finite() && *c >= 0.0),
        limits: usage
            .limits
            .into_iter()
            .filter(|limit| limit.used_percent.is_finite() && limit.used_percent >= 0.0)
            .map(|limit| LimitWindow {
                label: clamp(&limit.label),
                ..limit
            })
            .take(MAX_LIMITS)
            .collect(),
        ..usage
    }
}

/// A private settings directory that points Claude's status line at the reporting CLI.
pub struct StatusLine {
    directory: tempfile::TempDir,
}

impl StatusLine {
    pub fn new(exe: &Path, prefix: &[String]) -> Result<Self> {
        let directory = tempfile::Builder::new()
            .prefix("emdeck-usage-")
            .tempdir()
            .map_err(error)?;
        crate::protect_private_path(directory.path())?;
        let command = reporter_command(exe, prefix);
        std::fs::write(
            directory.path().join("settings.json"),
            serde_json::to_vec(&json!({"statusLine": {"type": "command", "command": command}}))
                .map_err(error)?,
        )
        .map_err(error)?;
        Ok(Self { directory })
    }

    pub fn settings(&self) -> PathBuf {
        self.directory.path().join("settings.json")
    }

    pub fn launch(&self, shell: &str) -> Result<String> {
        let file = self.settings().to_string_lossy().into_owned();
        let name = shell_name(shell);
        if name == "cmd" {
            if file.contains(['%', '!', '"']) {
                return Err(
                    "Use PowerShell for Claude usage reporting with this temporary folder path."
                        .into(),
                );
            }
            return Ok(format!("claude --settings \"{file}\""));
        }
        let powershell =
            matches!(name.as_str(), "powershell" | "pwsh") || (name.is_empty() && cfg!(windows));
        Ok(format!(
            "claude --settings {}",
            shell_quote(&file, powershell)
        ))
    }
}

fn shell_name(shell: &str) -> String {
    Path::new(shell)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase()
}

pub fn shell_quote(value: &str, powershell: bool) -> String {
    if powershell {
        format!("'{}'", value.replace('\'', "''"))
    } else {
        format!("'{}'", value.replace('\'', "'\"'\"'"))
    }
}

const ENCODED_POWERSHELL: &str =
    "powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ";

fn encoded_powershell(invocation: &str) -> String {
    use base64::Engine;
    let script = format!(
        "$OutputEncoding = [Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::In.ReadToEnd() | & {invocation}"
    );
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    format!(
        "{ENCODED_POWERSHELL}{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn reporter_command(exe: &Path, prefix: &[String]) -> String {
    let mut words = vec![exe.to_string_lossy().into_owned()];
    words.extend(prefix.iter().cloned());
    words.push("report-usage".into());
    let powershell = cfg!(windows);
    let invocation = words
        .iter()
        .map(|word| shell_quote(word, powershell))
        .collect::<Vec<_>>()
        .join(" ");
    if powershell {
        encoded_powershell(&invocation)
    } else {
        invocation
    }
}

/// The status line is printed back to Claude; reporting failures must not blank it.
pub fn status_line(usage: &Usage) -> String {
    format!(
        "Emdeck · {}{}",
        usage.model.as_deref().unwrap_or("Claude"),
        usage
            .context_percent
            .map(|n| format!(" · {n:.0}% context"))
            .unwrap_or_default()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_metrics_preserve_missing_zero_and_scope_without_private_data() {
        let value = json!({"session_id":"abc", "transcript_path":"private", "model":{"display_name":"Opus"}, "cost":{"total_cost_usd":0}, "context_window":{"total_input_tokens":1200,"total_output_tokens":50,"used_percentage":12,"context_window_size":10000}, "rate_limits":{"five_hour":{"used_percentage":0,"resets_at":123}}});
        let usage = claude_usage(&value);
        assert_eq!(usage.cost_usd, Some(0.0));
        assert_eq!(usage.input_tokens, Some(1200));
        assert_eq!(usage.limits[0].used_percent, 0.0);
        assert!(!serde_json::to_string(&usage).unwrap().contains("private"));
        let missing = claude_usage(&json!({}));
        assert_eq!(missing.cost_usd, None);
        assert_eq!(missing.context_percent, None);
        assert!(missing.limits.is_empty());
    }

    #[test]
    fn reports_from_a_pane_are_bounded_without_erasing_zero() {
        let usage = sanitize(Usage {
            source: "x".repeat(400),
            model: Some("a\u{7}b".into()),
            cost_usd: Some(f64::NAN),
            context_percent: Some(0.0),
            limits: (0..40)
                .map(|_| LimitWindow {
                    label: "l".repeat(400),
                    used_percent: 0.0,
                    resets_at: None,
                })
                .collect(),
            ..Default::default()
        });
        assert_eq!(usage.source.chars().count(), MAX_TEXT);
        assert_eq!(usage.model.as_deref(), Some("ab"));
        assert_eq!(usage.cost_usd, None);
        assert_eq!(usage.context_percent, Some(0.0));
        assert_eq!(usage.limits.len(), MAX_LIMITS);
        assert_eq!(usage.limits[0].label.chars().count(), MAX_TEXT);
        assert!(usage.updated_at > 0);
    }

    // Windows hands the reporter to PowerShell as a UTF-16 payload; assert on what it will run.
    fn reported(command: &str) -> String {
        let Some(encoded) = command.strip_prefix(ENCODED_POWERSHELL) else {
            return command.to_owned();
        };
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .expect("a base64 payload");
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        String::from_utf16(&units).expect("a UTF-16 script")
    }

    #[test]
    fn an_encoded_reporter_command_still_names_the_cli() {
        let invocation = "'C:\\Program Files\\emdeck.exe' session report-usage";
        let command = encoded_powershell(invocation);
        assert!(command.starts_with(ENCODED_POWERSHELL));
        assert!(reported(&command).ends_with(invocation));
    }

    #[test]
    fn status_line_settings_point_at_the_reporting_cli() {
        let line = StatusLine::new(Path::new("/opt/emdeck-session"), &[]).unwrap();
        let settings: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(line.settings()).unwrap()).unwrap();
        let command = settings["statusLine"]["command"].as_str().unwrap();
        assert!(reported(command).contains("report-usage"));
        assert!(line
            .launch("/bin/bash")
            .unwrap()
            .starts_with("claude --settings '"));
        assert!(line.launch("pwsh").unwrap().contains("--settings '"));
    }

    #[test]
    fn embedded_hosts_keep_their_session_argument() {
        let command = reporter_command(Path::new("/opt/emdeck-ide"), &["session".to_owned()]);
        let invocation = reported(&command);
        assert!(invocation.contains("session"));
        assert!(invocation.contains("report-usage"));
    }
}
