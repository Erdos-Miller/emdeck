use crate::{error, protocol::*, server, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{BufReader, Read},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
    pub host: String,
    pub port: Option<u16>,
    pub binary: String,
}
type Pending = HashMap<String, mpsc::Sender<Result<serde_json::Value>>>;
pub struct Bridge {
    input: Mutex<ChildStdin>,
    child: Mutex<Child>,
    pending: Mutex<Pending>,
    failure: Mutex<Option<String>>,
}
pub fn args(target: &Target) -> Result<Vec<String>> {
    if target.host.len() > 255
        || !target
            .host
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        || !target
            .host
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.@:[-]".contains(&c))
    {
        return Err("Use a configured SSH alias or user@hostname.".into());
    }
    if target.port == Some(0) {
        return Err("SSH port must be 1–65535.".into());
    }
    if target.binary.is_empty()
        || target.binary.len() > 512
        || target.binary.starts_with('-')
        || !target
            .binary
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b" /:._-".contains(&c))
    {
        return Err("Use an Emdeck session executable name or path (forward slashes), without shell syntax.".into());
    }
    let mut args: Vec<String> = [
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ForwardAgent=no",
        "-o",
        "ClearAllForwardings=yes",
        "-o",
        "PermitLocalCommand=no",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=2",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    if let Some(port) = target.port {
        args.extend(["-p".into(), port.to_string()]);
    }
    args.extend([
        "--".into(),
        target.host.clone(),
        format!("\"{}\" rpc", target.binary),
    ]);
    Ok(args)
}
impl Bridge {
    pub fn connect(target: &Target) -> Result<Arc<Self>> {
        let args = args(target)?;
        let executable = std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
            .filter(|p| p.is_absolute())
            .map(|p| p.join(if cfg!(windows) { "ssh.exe" } else { "ssh" }))
            .find(|p| p.is_file())
            .ok_or("OpenSSH was not found in PATH.")?;
        let mut command = Command::new(executable);
        command
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(error)?;
        let input = child.stdin.take().ok_or("SSH stdin is unavailable.")?;
        let output = child.stdout.take().ok_or("SSH stdout is unavailable.")?;
        let stderr = child.stderr.take().ok_or("SSH stderr is unavailable.")?;
        let bridge = Arc::new(Self {
            input: Mutex::new(input),
            child: Mutex::new(child),
            pending: Mutex::new(HashMap::new()),
            failure: Mutex::new(None),
        });
        let weak = Arc::downgrade(&bridge);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let response = server::line(&mut reader, MAX_RESPONSE)
                    .and_then(|line| serde_json::from_slice::<Response>(&line).map_err(error));
                let Some(bridge) = weak.upgrade() else {
                    break;
                };
                match response {
                    Ok(response) if response.version == PROTOCOL => {
                        if let Some(sender) = bridge
                            .pending
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .remove(&response.id)
                        {
                            let result = if let Some(error) = response.error {
                                Err(error)
                            } else {
                                Ok(response.result.unwrap_or(serde_json::Value::Null))
                            };
                            let _ = sender.send(result);
                        }
                    }
                    _ => {
                        bridge.fail("SSH session bridge disconnected. Reconnect after checking SSH keys, known_hosts and the remote server.");
                        break;
                    }
                }
            }
        });
        let weak = Arc::downgrade(&bridge);
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.take(8192).read_to_string(&mut text);
            if !text.trim().is_empty() {
                if let Some(bridge) = weak.upgrade() {
                    bridge.fail(&format!("SSH: {}", text.trim()));
                }
            }
        });
        bridge.call(Action::Ping)?;
        Ok(bridge)
    }
    fn fail(&self, message: &str) {
        *self.failure.lock().unwrap_or_else(|e| e.into_inner()) = Some(message.into());
        for (_, sender) in self
            .pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain()
        {
            let _ = sender.send(Err(message.into()));
        }
    }
    pub fn call(&self, action: Action) -> Result<serde_json::Value> {
        if let Some(error) = self.failure.lock().map_err(error)?.clone() {
            return Err(error);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let (sender, receiver) = mpsc::channel();
        {
            let mut pending = self.pending.lock().map_err(error)?;
            if pending.len() >= 96 {
                return Err("Too many pending SSH requests.".into());
            }
            pending.insert(id.clone(), sender);
        }
        let result = server::send(
            &mut *self.input.lock().map_err(error)?,
            &Request {
                version: PROTOCOL,
                id: id.clone(),
                token: String::new(),
                action,
            },
            MAX_REQUEST,
        );
        if let Err(e) = result {
            self.fail(&e);
        }
        let result = receiver
            .recv_timeout(Duration::from_secs(35))
            .map_err(|_| "SSH request timed out. Remote agents may still be running.".to_owned())
            .and_then(|v| v);
        self.pending.lock().map_err(error)?.remove(&id);
        result
    }
}
impl Drop for Bridge {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
