use crate::{error, Result};
use std::{
    io::Write,
    path::{Path, PathBuf},
};

pub const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
pub const MAX_CHUNK_BYTES: usize = 48 * 1024;
const MAX_SESSION_BYTES: u64 = 100 * 1024 * 1024;

struct Staging {
    name: String,
    total: u64,
    written: u64,
    file: tempfile::NamedTempFile,
}

#[derive(Default)]
pub struct Attachments {
    directory: Option<tempfile::TempDir>,
    staging: Option<Staging>,
    bytes: u64,
}

impl Attachments {
    /// Accepts one chunk and returns the saved path once the final chunk lands.
    pub fn accept(
        &mut self,
        name: &str,
        data: &[u8],
        offset: u64,
        total: u64,
    ) -> Result<Option<String>> {
        if data.len() > MAX_CHUNK_BYTES {
            return Err("Attachment chunks are limited to 48 KiB.".into());
        }
        if total == 0 || total > MAX_FILE_BYTES {
            return Err("Attachments are limited to 10 MiB per file.".into());
        }
        if offset == 0 {
            if self.bytes.saturating_add(total) > MAX_SESSION_BYTES {
                return Err("This terminal has reached its 100 MiB attachment limit.".into());
            }
            let directory = self.directory()?;
            self.staging = Some(Staging {
                name: name.to_owned(),
                total,
                written: 0,
                file: tempfile::Builder::new()
                    .prefix("paste-")
                    .suffix(&format!("-{}", file_name(name)))
                    .tempfile_in(directory)
                    .map_err(error)?,
            });
        }
        let Some(staging) = self.staging.as_mut() else {
            return Err("Send the first attachment chunk at offset zero.".into());
        };
        if staging.name != name
            || staging.total != total
            || staging.written != offset
            || offset.saturating_add(data.len() as u64) > total
        {
            self.staging = None;
            return Err("Attachment chunks arrived out of order. Paste the file again.".into());
        }
        staging.file.write_all(data).map_err(error)?;
        staging.written += data.len() as u64;
        if staging.written < staging.total {
            return Ok(None);
        }
        let mut staging = self.staging.take().expect("staging was borrowed above");
        staging.file.flush().map_err(error)?;
        self.bytes += staging.total;
        let (_, path) = staging.file.keep().map_err(error)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }

    fn directory(&mut self) -> Result<PathBuf> {
        if self.directory.is_none() {
            let directory = tempfile::Builder::new()
                .prefix("emdeck-attachments-")
                .tempdir()
                .map_err(error)?;
            crate::protect_private_path(directory.path())?;
            self.directory = Some(directory);
        }
        Ok(self.directory.as_ref().unwrap().path().to_owned())
    }
}

fn executable(value: &str) -> String {
    Path::new(value.trim_matches(['\'', '"']))
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase()
}

fn file_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .take(100)
        .collect()
}

/// Quoting follows the pane's shell; the refusal follows the program it launched.
pub fn paths_input(shell: &str, command: &str, paths: &[String]) -> Result<String> {
    if paths.is_empty() || paths.len() > 16 {
        return Err("Choose between 1 and 16 files.".into());
    }
    let program = executable(shell);
    let launched = command
        .split_whitespace()
        .next()
        .map(executable)
        .unwrap_or_else(|| program.clone());
    if matches!(launched.as_str(), "ssh" | "wsl") {
        return Err("Use a file path on the session's machine. File transfer through a remote shell pane is not available yet.".into());
    }
    let mut quoted = Vec::new();
    for path in paths {
        if !Path::new(path).is_absolute()
            || path.len() > 32768
            || path.chars().any(char::is_control)
        {
            return Err(
                "File paths must be absolute and cannot contain control characters.".into(),
            );
        }
        let value = match program.as_str() {
            "powershell" | "pwsh" => format!("'{}'", path.replace('\'', "''")),
            "cmd" => {
                if path.contains(['%', '!', '"']) {
                    return Err("This filename cannot be pasted safely into cmd.exe. Use PowerShell for this file.".into());
                }
                format!("\"{path}\"")
            }
            _ => {
                let path = if cfg!(windows) {
                    path.replace('\\', "/")
                } else {
                    path.clone()
                };
                format!("'{}'", path.replace('\'', "'\\''"))
            }
        };
        quoted.push(value);
    }
    Ok(format!("{} ", quoted.join(" ")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunked_pastes_land_as_one_file_and_leave_with_the_terminal() {
        let saved = {
            let mut attachments = Attachments::default();
            assert_eq!(
                attachments
                    .accept("../../screen shot.png", b"first ", 0, 12)
                    .unwrap(),
                None
            );
            let path = attachments
                .accept("../../screen shot.png", b"second", 6, 12)
                .unwrap()
                .expect("final chunk returns the path");
            assert_eq!(std::fs::read(&path).unwrap(), b"first second");
            assert!(Path::new(&path)
                .file_name()
                .unwrap()
                .to_string_lossy()
                .ends_with("screen_shot.png"));
            path
        };
        assert!(!Path::new(&saved).exists());
    }

    #[test]
    fn out_of_order_oversized_and_unopened_chunks_are_refused() {
        let mut attachments = Attachments::default();
        assert!(attachments.accept("a.png", b"tail", 4, 8).is_err());
        assert!(attachments
            .accept("a.png", &vec![0; MAX_CHUNK_BYTES + 1], 0, MAX_FILE_BYTES)
            .is_err());
        assert!(attachments
            .accept("a.png", b"x", 0, MAX_FILE_BYTES + 1)
            .is_err());
        assert_eq!(attachments.accept("a.png", b"ab", 0, 4).unwrap(), None);
        assert!(attachments.accept("b.png", b"cd", 2, 4).is_err());
        assert!(attachments.accept("a.png", b"cd", 2, 4).is_err());
    }

    #[test]
    fn quoting_protects_spaces_and_shell_syntax_without_submitting_input() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir
            .path()
            .join("a ' $test ; image.png")
            .to_string_lossy()
            .into_owned();
        assert_eq!(
            paths_input("pwsh", "", std::slice::from_ref(&path)).unwrap(),
            format!("'{}' ", path.replace('\'', "''"))
        );
        assert_eq!(
            paths_input("bash", "", std::slice::from_ref(&path)).unwrap(),
            format!("'{}' ", path.replace('\\', "/").replace('\'', "'\\''"))
        );
        assert!(!paths_input("pwsh", "", &[path])
            .unwrap()
            .contains(['\r', '\n']));
        assert!(paths_input("pwsh", "", &["relative.png".into()]).is_err());
        assert!(paths_input(
            "bash",
            "ssh dima@host",
            &[dir.path().to_string_lossy().into_owned()]
        )
        .is_err());
        assert!(paths_input(
            "cmd",
            "",
            &[dir.path().join("%PATH%.png").to_string_lossy().into_owned()]
        )
        .is_err());
    }

    #[test]
    fn quoted_paths_roundtrip_through_the_local_shell_as_one_literal_value() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir
            .path()
            .join("a ' $value ; image.png")
            .to_string_lossy()
            .into_owned();
        let program = if cfg!(windows) {
            "powershell.exe"
        } else {
            "/bin/sh"
        };
        let input = paths_input(program, "", std::slice::from_ref(&path)).unwrap();
        let mut command = std::process::Command::new(program);
        if cfg!(windows) {
            command.args([
                "-NoLogo",
                "-NoProfile",
                "-Command",
                &format!("[Console]::Write({})", input.trim_end()),
            ]);
        } else {
            command.args(["-c", &format!("printf '%s' {input}")]);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(String::from_utf8(output.stdout).unwrap(), path);
    }
}
