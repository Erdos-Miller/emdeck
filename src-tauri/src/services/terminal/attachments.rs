use crate::services::workspace::{err, Result};
use std::{io::Write, path::Path};

pub const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
const MAX_SESSION_BYTES: usize = 100 * 1024 * 1024;

#[derive(Default)]
pub struct Attachments {
    directory: Option<tempfile::TempDir>,
    bytes: usize,
}

impl Attachments {
    pub fn save(&mut self, name: &str, data: &[u8]) -> Result<String> {
        if data.len() > MAX_FILE_BYTES || self.bytes + data.len() > MAX_SESSION_BYTES {
            return Err(
                "Attachments are limited to 10 MiB per file and 100 MiB per terminal.".into(),
            );
        }
        let name: String = name
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                    c
                } else {
                    '_'
                }
            })
            .take(100)
            .collect();
        if self.directory.is_none() {
            self.directory = Some(
                tempfile::Builder::new()
                    .prefix("emdeck-attachments-")
                    .tempdir()
                    .map_err(err)?,
            );
        }
        let directory = self.directory.as_ref().unwrap().path();
        emdeck_session::protect_private_path(directory)?;
        let mut file = tempfile::Builder::new()
            .prefix("paste-")
            .suffix(&format!("-{name}"))
            .tempfile_in(directory)
            .map_err(err)?;
        file.write_all(data).map_err(err)?;
        file.flush().map_err(err)?;
        let (_, path) = file.keep().map_err(err)?;
        self.bytes += data.len();
        Ok(path.to_string_lossy().into_owned())
    }
}

pub fn paths_input(program: &str, paths: &[String]) -> Result<String> {
    if paths.is_empty() || paths.len() > 16 {
        return Err("Choose between 1 and 16 files.".into());
    }
    let program = Path::new(program)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    if matches!(program.as_str(), "ssh" | "wsl") {
        return Err("Use a file path on the session's machine. File transfer to SSH or WSL sessions is not available yet.".into());
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
    fn pasted_files_keep_bytes_and_are_removed_with_the_terminal() {
        let path = {
            let mut attachments = Attachments::default();
            let path = attachments
                .save("../../screen shot.png", b"test image bytes")
                .unwrap();
            assert_eq!(std::fs::read(&path).unwrap(), b"test image bytes");
            assert!(Path::new(&path)
                .file_name()
                .unwrap()
                .to_string_lossy()
                .ends_with("screen_shot.png"));
            let other = attachments
                .save("../../screen shot.png", b"second")
                .unwrap();
            assert_ne!(other, path);
            assert!(attachments
                .save("big.png", &vec![0; MAX_FILE_BYTES + 1])
                .is_err());
            path
        };
        assert!(!Path::new(&path).exists());
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
            paths_input("pwsh", std::slice::from_ref(&path)).unwrap(),
            format!("'{}' ", path.replace('\'', "''"))
        );
        assert_eq!(
            paths_input("bash", std::slice::from_ref(&path)).unwrap(),
            format!("'{}' ", path.replace('\\', "/").replace('\'', "'\\''"))
        );
        assert!(!paths_input("pwsh", &[path]).unwrap().contains(['\r', '\n']));
        assert!(paths_input("pwsh", &["relative.png".into()]).is_err());
        assert!(paths_input("ssh", &[dir.path().to_string_lossy().into_owned()]).is_err());
        assert!(paths_input(
            "cmd",
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
        let input = paths_input(program, std::slice::from_ref(&path)).unwrap();
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
