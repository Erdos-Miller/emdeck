use crate::{
    agent, error,
    protocol::{PaneInfo, ReadResult},
    screen::{self, Replies},
    Result,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::{
    collections::VecDeque,
    io::{Read, Write},
    path::Path,
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const BUFFER_BYTES: usize = 512 * 1024;
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.clamp(10, 300),
        rows: rows.clamp(2, 120),
        pixel_width: 0,
        pixel_height: 0,
    }
}

pub struct Live {
    pub info: PaneInfo,
    parser: vt100::Parser<Replies>,
    sequence: u64,
    chunks: VecDeque<(u64, Vec<u8>)>,
    bytes: usize,
    owner: Option<(String, Instant)>,
    dirty: bool,
}
pub struct Terminal {
    pub live: Mutex<Live>,
    pub changed: Condvar,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    killer: Mutex<Option<Box<dyn ChildKiller + Send + Sync>>>,
}
impl Terminal {
    pub fn new(info: PaneInfo) -> Self {
        Self {
            live: Mutex::new(Live {
                parser: vt100::Parser::new_with_callbacks(
                    info.rows,
                    info.cols,
                    200,
                    Replies::default(),
                ),
                info,
                sequence: 0,
                chunks: VecDeque::new(),
                bytes: 0,
                owner: None,
                dirty: false,
            }),
            changed: Condvar::new(),
            master: Mutex::new(None),
            writer: Mutex::new(None),
            killer: Mutex::new(None),
        }
    }
    pub fn info(&self) -> PaneInfo {
        self.live
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .info
            .clone()
    }
    pub fn spawn(
        self: &Arc<Self>,
        mut command: CommandBuilder,
        changed: Arc<dyn Fn(bool) + Send + Sync>,
    ) -> Result<()> {
        let info = self.info();
        command.env("EMDECK_PANE_ID", &info.id);
        command.env("EMDECK_PANE_GENERATION", &info.generation);
        let pair = native_pty_system()
            .openpty(size(info.cols, info.rows))
            .map_err(error)?;
        let mut reader = pair.master.try_clone_reader().map_err(error)?;
        *self.writer.lock().map_err(error)? = Some(pair.master.take_writer().map_err(error)?);
        let mut child = pair.slave.spawn_command(command).map_err(error)?;
        drop(pair.slave);
        *self.killer.lock().map_err(error)? =
            Some(crate::process::killer(&*child).inspect_err(|_| {
                let _ = child.kill();
            })?);
        *self.master.lock().map_err(error)? = Some(pair.master);
        self.live.lock().map_err(error)?.info.running = true;
        let output = self.clone();
        let output_changed = changed.clone();
        let reading = std::thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            while let Ok(count) = reader.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                let mut live = output.live.lock().unwrap_or_else(|e| e.into_inner());
                live.parser.process(&buffer[..count]);
                let replies = std::mem::take(&mut live.parser.callbacks_mut().bytes);
                let title = live.parser.callbacks_mut().title.take();
                let title_changed = title
                    .as_ref()
                    .is_some_and(|title| live.info.title.as_ref() != Some(title));
                if let Some(title) = title {
                    live.info.title = Some(title);
                }
                live.sequence += 1;
                let sequence = live.sequence;
                live.chunks.push_back((sequence, buffer[..count].to_vec()));
                live.bytes += count;
                while live.bytes > BUFFER_BYTES {
                    if let Some((_, bytes)) = live.chunks.pop_front() {
                        live.bytes -= bytes.len();
                    }
                }
                live.dirty = true;
                drop(live);
                output.changed.notify_all();
                if title_changed {
                    output_changed(false);
                }
                if !replies.is_empty() {
                    let _ = output.write_raw(&replies);
                }
            }
        });
        let terminal = self.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|s| s.exit_code());
            terminal
                .master
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take();
            let _ = reading.join();
            terminal
                .writer
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take();
            terminal
                .killer
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take();
            let mut live = terminal.live.lock().unwrap_or_else(|e| e.into_inner());
            live.info.running = false;
            live.info.exit_code = code;
            live.info.agent.state = crate::protocol::AgentState::Stopped;
            live.owner = None;
            drop(live);
            terminal.changed.notify_all();
            changed(true);
        });
        Ok(())
    }
    pub fn attach(&self, client: &str, takeover: bool) -> Result<()> {
        if client.is_empty() || client.len() > 100 {
            return Err("Invalid client identity.".into());
        }
        let mut live = self.live.lock().map_err(error)?;
        if let Some((owner, seen)) = &live.owner {
            if owner != client && seen.elapsed() < Duration::from_secs(45) && !takeover {
                return Err(
                    "Another client owns this terminal. Use Take control explicitly.".into(),
                );
            }
        }
        live.owner = Some((client.into(), Instant::now()));
        Ok(())
    }
    pub fn detach(&self, client: &str) -> Result<()> {
        let mut live = self.live.lock().map_err(error)?;
        if live
            .owner
            .as_ref()
            .is_some_and(|(owner, _)| owner == client)
        {
            live.owner = None;
        }
        Ok(())
    }
    fn authorize(&self, client: &str) -> Result<()> {
        let mut live = self.live.lock().map_err(error)?;
        if let Some((owner, seen)) = &mut live.owner {
            if owner == client {
                *seen = Instant::now();
                return Ok(());
            }
        }
        Err("This client does not own terminal input. Attach or take control first.".into())
    }
    pub fn input(&self, client: &str, text: &str) -> Result<()> {
        self.authorize(client)?;
        if text.len() > 64 * 1024 {
            return Err("Input exceeds 64 KiB.".into());
        }
        self.write_raw(text.as_bytes())
    }
    pub fn write_raw(&self, bytes: &[u8]) -> Result<()> {
        let mut writer = self.writer.lock().map_err(error)?;
        let writer = writer.as_mut().ok_or("Terminal is not running.")?;
        writer.write_all(bytes).map_err(error)?;
        writer.flush().map_err(error)
    }
    pub fn resize(&self, client: &str, cols: u16, rows: u16) -> Result<()> {
        self.authorize(client)?;
        let size = size(cols, rows);
        let mut live = self.live.lock().map_err(error)?;
        if live.info.cols == size.cols && live.info.rows == size.rows {
            return Ok(());
        }
        live.info.cols = size.cols;
        live.info.rows = size.rows;
        live.parser.screen_mut().set_size(size.rows, size.cols);
        drop(live);
        self.master
            .lock()
            .map_err(error)?
            .as_ref()
            .ok_or("Terminal is not running.")?
            .resize(size)
            .map_err(error)
    }
    pub fn read(&self, after: Option<u64>, wait_ms: u32) -> Result<ReadResult> {
        let mut live = self.live.lock().map_err(error)?;
        if after == Some(live.sequence) && live.info.running && wait_ms > 0 {
            live = self
                .changed
                .wait_timeout(live, Duration::from_millis(wait_ms.min(25_000) as u64))
                .map_err(error)?
                .0;
        }
        let reset = after.is_none_or(|value| {
            value > live.sequence
                || live
                    .chunks
                    .front()
                    .is_some_and(|(first, _)| value.saturating_add(1) < *first)
        });
        let data = if reset {
            screen::replay(&live.parser)
        } else {
            live.chunks
                .iter()
                .filter(|(seq, _)| *seq > after.unwrap_or(0))
                .flat_map(|(_, bytes)| bytes.clone())
                .collect()
        };
        Ok(ReadResult {
            sequence: live.sequence,
            reset,
            data: STANDARD.encode(data),
            text: live.parser.screen().contents(),
            pane: live.info.clone(),
        })
    }
    pub fn stop(&self) -> Result<()> {
        if let Some(killer) = self.killer.lock().map_err(error)?.as_mut() {
            killer.kill().map_err(error)?;
        }
        Ok(())
    }
    pub fn bracketed_paste(&self) -> bool {
        self.live
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .parser
            .screen()
            .bracketed_paste()
    }
    pub fn inspect(&self) -> bool {
        let mut live = self.live.lock().unwrap_or_else(|e| e.into_inner());
        if !live.dirty || !live.info.running {
            return false;
        }
        live.dirty = false;
        let next = agent::observe(&live.info.agent, &live.parser.screen().contents());
        let changed = next.kind != live.info.agent.kind
            || next.state != live.info.agent.state
            || next.reason != live.info.agent.reason;
        live.info.agent = next;
        changed
    }
    pub fn prompt(&self, generation: &str, text: &str) -> Result<()> {
        let mut live = self.live.lock().map_err(error)?;
        if live.info.generation != generation || !live.info.running {
            return Err("Agent occupant changed or stopped.".into());
        }
        if !matches!(
            live.info.agent.state,
            crate::protocol::AgentState::Idle | crate::protocol::AgentState::Done
        ) {
            return Err("Prompt requires a positively identified idle agent. Blocked/unknown agents require explicit terminal input.".into());
        }
        if text.is_empty()
            || text.len() > 64 * 1024
            || text
                .chars()
                .any(|c| c.is_control() && c != '\n' && c != '\t')
        {
            return Err("Prompt must be plain text, at most 64 KiB.".into());
        }
        if text.contains('\n') && !live.parser.screen().bracketed_paste() {
            return Err(
                "This terminal has not enabled bracketed paste; use a single-line prompt.".into(),
            );
        }
        let input = if live.parser.screen().bracketed_paste() {
            format!("\x1b[200~{text}\x1b[201~\r")
        } else {
            format!("{text}\r")
        };
        self.write_raw(input.as_bytes())?;
        live.info.agent.state = crate::protocol::AgentState::Working;
        live.info.agent.reason = "Prompt submitted; waiting for lifecycle evidence.".into();
        Ok(())
    }
}

pub fn command(info: &PaneInfo, home: &Path, resume: bool) -> Result<CommandBuilder> {
    let launch = &info.launch;
    let shell = if launch.shell.is_empty() {
        if cfg!(windows) {
            "powershell.exe".into()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
        }
    } else {
        launch.shell.clone()
    };
    let name = Path::new(&shell)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let mut command = if resume {
        let args = agent::resume_args(&info.agent)
            .ok_or("No supported native conversation was registered for this pane.")?;
        let mut command = CommandBuilder::new(crate::process::executable(&args[0])?);
        command.args(&args[1..]);
        command
    } else {
        let mut command = CommandBuilder::new(crate::process::executable(&shell)?);
        if !launch.command.trim().is_empty() {
            match name.as_str() {
                "powershell" | "pwsh" => {
                    command.args(["-NoLogo", "-NoProfile", "-Command", &launch.command])
                }
                "cmd" => command.args(["/D", "/S", "/C", &launch.command]),
                _ => command.args(["-lc", &launch.command]),
            }
        } else if matches!(name.as_str(), "powershell" | "pwsh") {
            command.arg("-NoLogo");
        }
        command
    };
    #[cfg(windows)]
    for (key, value) in std::env::vars_os() {
        command.env(key, value);
    }
    command.cwd(&launch.cwd);
    crate::configure_terminal_environment(&mut command);
    command.env("EMDECK_SESSION_HOME", home);
    if let Ok(exe) = std::env::current_exe() {
        command.env("EMDECK_CLI_EXE", exe);
    }
    Ok(command)
}
