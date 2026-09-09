use crate::services::workspace::{err, Result};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::ipc::Channel;

#[cfg(test)]
mod stress;

#[cfg(all(test, windows))]
mod environment_tests;

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum TerminalEvent {
    Data {
        data: Vec<u8>,
    },
    Exit {
        code: Option<u32>,
    },
    Usage {
        usage: crate::services::agent_usage::Usage,
    },
}
pub struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}
#[derive(Default)]
pub struct Terminals {
    pub sessions: Arc<Mutex<HashMap<String, Session>>>,
    counter: AtomicU64,
    closed: AtomicBool,
}

/// Every desktop window owns its terminal group, including its shutdown lifecycle.
#[derive(Default)]
pub struct WindowTerminals(Mutex<HashMap<String, Arc<Terminals>>>);
impl WindowTerminals {
    pub fn register(&self, label: &str) -> Result<()> {
        self.0.lock().map_err(err)?.entry(label.into()).or_default();
        Ok(())
    }
    pub fn get(&self, label: &str) -> Result<Arc<Terminals>> {
        self.0
            .lock()
            .map_err(err)?
            .get(label)
            .cloned()
            .ok_or_else(|| "This workspace window has closed.".into())
    }
    pub fn close_window(&self, label: &str) {
        let group = self
            .0
            .lock()
            .ok()
            .and_then(|mut groups| groups.remove(label));
        if let Some(group) = group {
            group.close_all();
        }
    }
    pub fn close_all(&self) {
        let groups = self
            .0
            .lock()
            .map(|mut groups| groups.drain().map(|(_, group)| group).collect::<Vec<_>>())
            .unwrap_or_default();
        for group in groups {
            group.close_all();
        }
    }
}

pub(crate) fn program_command(program: impl AsRef<std::ffi::OsStr>, cwd: &Path) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(program);
    #[cfg(windows)]
    for (key, value) in std::env::vars_os() {
        cmd.env(key, value);
    }
    cmd.cwd(cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Emdeck");
    cmd
}

fn shell_command(shell: &str, command: &str, cwd: &Path) -> CommandBuilder {
    let program = if shell.trim().is_empty() {
        if cfg!(windows) {
            "powershell.exe".to_owned()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
        }
    } else {
        shell.to_owned()
    };
    let name = Path::new(&program)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let mut cmd = program_command(&program, cwd);
    if !command.trim().is_empty() {
        match name.as_str() {
            "powershell" | "pwsh" => {
                cmd.args(["-NoLogo", "-NoProfile", "-Command", command]);
            }
            "cmd" => {
                cmd.args(["/D", "/S", "/C", command]);
            }
            _ => {
                cmd.args(["-lc", command]);
            }
        }
    } else if name == "powershell" || name == "pwsh" {
        cmd.arg("-NoLogo");
    }
    cmd
}

impl Terminals {
    #[cfg(test)]
    pub fn spawn(
        &self,
        cwd: &Path,
        shell: &str,
        command: &str,
        cols: u16,
        rows: u16,
        callback: impl Fn(TerminalEvent) -> bool + Send + Sync + 'static,
    ) -> Result<String> {
        self.spawn_with_usage(cwd, shell, command, cols, rows, false, callback)
    }
    #[allow(clippy::too_many_arguments)]
    pub fn spawn_with_usage(
        &self,
        cwd: &Path,
        shell: &str,
        command: &str,
        cols: u16,
        rows: u16,
        enhanced_usage: bool,
        callback: impl Fn(TerminalEvent) -> bool + Send + Sync + 'static,
    ) -> Result<String> {
        let probe = if enhanced_usage && command.trim() == "claude" {
            Some(crate::services::agent_usage::Probe::new()?)
        } else {
            None
        };
        let launch = match &probe {
            Some(p) => p.command(shell)?,
            None => command.into(),
        };
        self.spawn_prepared(
            shell_command(shell, &launch, cwd),
            probe,
            cols,
            rows,
            callback,
        )
    }

    pub(crate) fn spawn_prepared(
        &self,
        command: CommandBuilder,
        probe: Option<crate::services::agent_usage::Probe>,
        cols: u16,
        rows: u16,
        callback: impl Fn(TerminalEvent) -> bool + Send + Sync + 'static,
    ) -> Result<String> {
        let mut sessions = self.sessions.lock().map_err(err)?;
        if self.closed.load(Ordering::Relaxed) {
            return Err("This workspace window has closed.".into());
        }
        if sessions.len() >= 12 {
            return Err(
                "Close a terminal before opening another (12 active panes maximum).".into(),
            );
        }
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: rows.max(2),
                cols: cols.max(10),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(err)?;
        let mut child = pair.slave.spawn_command(command).map_err(err)?;
        drop(pair.slave);
        let killer = emdeck_session::child_killer(&*child).inspect_err(|_| {
            let _ = child.kill();
        })?;
        let mut reader = pair.master.try_clone_reader().map_err(err)?;
        let writer = pair.master.take_writer().map_err(err)?;
        let id = format!("pty-{}", self.counter.fetch_add(1, Ordering::Relaxed));
        sessions.insert(
            id.clone(),
            Session {
                master: pair.master,
                writer,
                killer,
            },
        );
        let map = self.sessions.clone();
        let session_id = id.clone();
        let callback = Arc::new(callback);
        let output_callback = callback.clone();
        let output_thread = std::thread::spawn(move || {
            let mut bytes = [0u8; 8192];
            let mut last_usage = None;
            let mut last_modified = None;
            while let Ok(n) = reader.read(&mut bytes) {
                if n == 0 {
                    break;
                }
                if !output_callback(TerminalEvent::Data {
                    data: bytes[..n].to_vec(),
                }) {
                    break;
                }
                // The reporter writes before printing its status line. Inspect the
                // timestamp on output so a short final burst cannot be throttled away.
                if let Some(usage) = probe
                    .as_ref()
                    .and_then(|p| p.read_changed(&mut last_modified))
                {
                    if last_usage.as_ref() != Some(&usage) {
                        last_usage = Some(usage.clone());
                        if !output_callback(TerminalEvent::Usage { usage }) {
                            break;
                        }
                    }
                }
            }
            if let Some(usage) = probe.as_ref().and_then(|p| p.read()) {
                let _ = output_callback(TerminalEvent::Usage { usage });
            }
        });
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|s| s.exit_code());
            // ConPTY does not close the output pipe until the master is released.
            let _ = map.lock().map(|mut m| m.remove(&session_id));
            let _ = output_thread.join();
            callback(TerminalEvent::Exit { code });
        });
        Ok(id)
    }
    pub fn write(&self, id: &str, data: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().map_err(err)?;
        let session = sessions.get_mut(id).ok_or("Terminal has exited.")?;
        session.writer.write_all(data.as_bytes()).map_err(err)?;
        session.writer.flush().map_err(err)
    }
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().map_err(err)?;
        let session = sessions.get(id).ok_or("Terminal has exited.")?;
        session
            .master
            .resize(PtySize {
                cols: cols.max(10),
                rows: rows.max(2),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(err)
    }
    pub fn close(&self, id: &str) -> Result<()> {
        if let Some(mut session) = self.sessions.lock().map_err(err)?.remove(id) {
            session.killer.kill().map_err(err)?;
        }
        Ok(())
    }
    pub fn close_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            self.closed.store(true, Ordering::Relaxed);
            for (_, mut s) in sessions.drain() {
                let _ = s.killer.kill();
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn spawn_channel(
    terminals: &Terminals,
    cwd: &Path,
    shell: &str,
    command: &str,
    cols: u16,
    rows: u16,
    enhanced_usage: bool,
    channel: Channel<TerminalEvent>,
) -> Result<String> {
    terminals.spawn_with_usage(
        cwd,
        shell,
        command,
        cols,
        rows,
        enhanced_usage,
        move |event| channel.send(event).is_ok(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn window_groups_are_independent_and_cannot_restart_after_closing() {
        let groups = WindowTerminals::default();
        groups.register("main").unwrap();
        groups.register("workspace-1").unwrap();
        let first = groups.get("main").unwrap();
        let second = groups.get("workspace-1").unwrap();
        assert!(!Arc::ptr_eq(&first, &second));
        groups.close_window("main");
        assert!(groups.get("main").is_err());
        assert!(first.closed.load(Ordering::Relaxed));
        assert!(!second.closed.load(Ordering::Relaxed));
        let dir = tempfile::tempdir().unwrap();
        assert!(first.spawn(dir.path(), "", "", 80, 24, |_| true).is_err());
        assert!(Arc::ptr_eq(&second, &groups.get("workspace-1").unwrap()));
        groups.close_all();
        assert!(second.closed.load(Ordering::Relaxed));
    }
    #[test]
    fn real_pty_streams_unicode_and_exit() {
        let temp = tempfile::tempdir().unwrap();
        let terminals = Terminals::default();
        let (tx, rx) = std::sync::mpsc::channel();
        let command = if cfg!(windows) {
            "Write-Output 'emdeck-pty-ok'; exit 0"
        } else {
            "printf 'emdeck-pty-ok\\n'; exit 0"
        };
        let id = terminals
            .spawn(temp.path(), "", command, 80, 24, move |e| {
                tx.send(e).is_ok()
            })
            .unwrap();
        let _ = terminals.resize(&id, 100, 30);
        let mut output = vec![];
        loop {
            match rx
                .recv_timeout(std::time::Duration::from_secs(15))
                .unwrap_or_else(|e| {
                    panic!(
                        "PTY timeout: {e}; output={:?}",
                        String::from_utf8_lossy(&output)
                    )
                }) {
                TerminalEvent::Data { data } => {
                    output.extend(data);
                    // Headless tests must answer ConPTY's initial cursor query like xterm does.
                    if output.windows(4).any(|w| w == b"\x1b[6n") {
                        let _ = terminals.write(&id, "\x1b[1;1R");
                    }
                }
                TerminalEvent::Exit { code } => {
                    assert_eq!(code, Some(0));
                    break;
                }
                TerminalEvent::Usage { .. } => panic!("Plain shells must not create usage probes"),
            }
        }
        assert!(String::from_utf8_lossy(&output).contains("emdeck-pty-ok"));
        assert!(terminals.sessions.lock().unwrap().is_empty());
    }
}
