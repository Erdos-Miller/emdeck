use crate::services::workspace::{err, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const FILE_NAME: &str = "command.json";
const MAX_INPUT: u64 = 8_192;
const MAX_TEXT: usize = 512;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum AgentCommand {
    ShowDiff {
        reference: String,
        #[serde(default)]
        working: bool,
    },
    OpenFile {
        path: String,
    },
}

fn clean(value: &str) -> Result<String> {
    let text: String = value
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_TEXT)
        .collect();
    if text.trim().is_empty() {
        return Err("Agent command needs a non-empty value.".into());
    }
    Ok(text)
}

// The CLI has no repository context, so bare names pass and the app resolves them.
fn branch_reference(value: &str) -> Result<String> {
    let text = clean(value)?;
    let name = text.trim();
    if name.starts_with("refs/")
        && !(name.starts_with("refs/heads/") || name.starts_with("refs/remotes/"))
    {
        return Err("showDiff needs a local or remote branch reference.".into());
    }
    if name == "HEAD"
        || name.starts_with('-')
        || name.contains("@{")
        || name.contains("..")
        || name
            .chars()
            .any(|c| matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\') || c.is_whitespace())
    {
        return Err("showDiff needs a branch, not a revision expression.".into());
    }
    Ok(name.to_owned())
}

fn sanitize(command: AgentCommand) -> Result<AgentCommand> {
    Ok(match command {
        AgentCommand::ShowDiff { reference, working } => AgentCommand::ShowDiff {
            reference: branch_reference(&reference)?,
            working,
        },
        AgentCommand::OpenFile { path } => AgentCommand::OpenFile {
            path: clean(&path)?,
        },
    })
}

pub fn target(path: &Path) -> Result<PathBuf> {
    let parent = path
        .parent()
        .ok_or("Missing command directory")?
        .canonicalize()
        .map_err(err)?;
    let temp = std::env::temp_dir().canonicalize().map_err(err)?;
    if path.file_name().is_none_or(|n| n != FILE_NAME)
        || parent.parent() != Some(temp.as_path())
        || !parent
            .file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with("emdeck-agent-"))
    {
        return Err("Commands are confined to Emdeck's temporary session directory.".into());
    }
    Ok(parent.join(FILE_NAME))
}

pub fn write(path: &Path, input: impl Read) -> Result<AgentCommand> {
    let path = target(path)?;
    let mut data = Vec::new();
    input
        .take(MAX_INPUT + 1)
        .read_to_end(&mut data)
        .map_err(err)?;
    if data.len() as u64 > MAX_INPUT {
        return Err("Agent command too large".into());
    }
    let command = sanitize(serde_json::from_slice(&data).map_err(err)?)?;
    // Overwriting would drop the earlier command while its writer was told it landed.
    if path.exists() {
        return Err("Emdeck is still holding an earlier command.".into());
    }
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().unwrap()).map_err(err)?;
    temp.write_all(&serde_json::to_vec(&command).map_err(err)?)
        .map_err(err)?;
    temp.persist(&path).map_err(err)?;
    Ok(command)
}

// Claiming by rename keeps a command written mid-read pending instead of unlinked unread.
pub fn take(directory: &Path) -> Option<AgentCommand> {
    let claimed = directory.join("command.taken");
    fs::rename(directory.join(FILE_NAME), &claimed).ok()?;
    // Anything in the pane can write this file directly, so bound it here too.
    let data = fs::metadata(&claimed)
        .ok()
        .filter(|meta| meta.len() <= MAX_INPUT)
        .and_then(|_| fs::read(&claimed).ok());
    let _ = fs::remove_file(&claimed);
    serde_json::from_slice(&data?).ok()
}

pub fn command_cli() -> bool {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new("--agent-command")) {
        return false;
    }
    // Agents chain on this, so a rejection has to fail the process, not just print.
    match args.next() {
        Some(path) => match write(Path::new(&path), std::io::stdin().lock()) {
            Ok(_) => println!("Emdeck queued the command."),
            Err(error) => {
                eprintln!("Emdeck rejected the command: {error}");
                std::process::exit(1);
            }
        },
        None => {
            eprintln!("Emdeck needs a command file path.");
            std::process::exit(1);
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::agent_usage::Probe;

    // Every accepted command is claimed here, so each case also proves it survives take.
    fn round_trip(probe: &Probe, body: &[u8]) -> Result<AgentCommand> {
        let written = write(&probe.directory().join(FILE_NAME), body)?;
        assert_eq!(take(probe.directory()).as_ref(), Some(&written));
        Ok(written)
    }

    #[test]
    fn parses_and_sanitizes_supported_operations() {
        let probe = Probe::new().unwrap();
        assert_eq!(
            round_trip(
                &probe,
                br#"{"op":"showDiff","reference":"refs/heads/main","working":true}"#
            )
            .unwrap(),
            AgentCommand::ShowDiff {
                reference: "refs/heads/main".into(),
                working: true
            }
        );
        assert_eq!(
            round_trip(&probe, br#"{"op":"showDiff","reference":"main"}"#).unwrap(),
            AgentCommand::ShowDiff {
                reference: "main".into(),
                working: false
            }
        );
        assert_eq!(
            round_trip(&probe, br#"{"op":"openFile","path":"src/App.tsx"}"#).unwrap(),
            AgentCommand::OpenFile {
                path: "src/App.tsx".into()
            }
        );
        assert_eq!(
            round_trip(
                &probe,
                "{\"op\":\"openFile\",\"path\":\"src/a\\u0007b.ts\"}".as_bytes()
            )
            .unwrap(),
            AgentCommand::OpenFile {
                path: "src/ab.ts".into()
            }
        );
        assert!(round_trip(&probe, br#"{"op":"openFile","path":"  "}"#).is_err());
        assert!(round_trip(&probe, br#"{"op":"gitCommit","message":"x"}"#).is_err());
        assert!(round_trip(&probe, br#"{"op":"showDiff"}"#).is_err());
    }

    #[test]
    fn a_pending_command_is_never_overwritten_and_oversized_files_are_ignored() {
        let probe = Probe::new().unwrap();
        let target = probe.directory().join(FILE_NAME);
        write(
            &target,
            br#"{"op":"openFile","path":"first.ts"}"#.as_slice(),
        )
        .unwrap();
        assert!(write(
            &target,
            br#"{"op":"openFile","path":"second.ts"}"#.as_slice()
        )
        .is_err());
        assert_eq!(
            take(probe.directory()),
            Some(AgentCommand::OpenFile {
                path: "first.ts".into()
            })
        );
        write(
            &target,
            br#"{"op":"openFile","path":"third.ts"}"#.as_slice(),
        )
        .unwrap();

        let oversized = format!(
            r#"{{"op":"openFile","path":"{}"}}"#,
            "a".repeat(MAX_INPUT as usize)
        );
        fs::write(&target, oversized).unwrap();
        assert_eq!(take(probe.directory()), None);
        assert!(!target.exists());
    }

    #[test]
    fn show_diff_takes_branches_and_refuses_revision_expressions() {
        let probe = Probe::new().unwrap();
        for reference in [
            "refs/heads/main",
            "refs/remotes/origin/main",
            "main",
            "origin/shared",
            "dima/feature/branch-name",
        ] {
            let body = format!(r#"{{"op":"showDiff","reference":"{reference}"}}"#);
            assert!(
                round_trip(&probe, body.as_bytes()).is_ok(),
                "{reference} should be accepted"
            );
        }
        for reference in [
            "HEAD",
            "HEAD~1",
            "main^",
            "main..dev",
            "main@{yesterday}",
            "refs/tags/v1",
            "-delete",
            "a branch",
            "src/*",
        ] {
            let body = format!(r#"{{"op":"showDiff","reference":"{reference}"}}"#);
            assert!(
                round_trip(&probe, body.as_bytes()).is_err(),
                "{reference} should be refused"
            );
        }
    }

    #[test]
    fn writes_are_atomic_scoped_and_bounded() {
        let probe = Probe::new().unwrap();
        let target = probe.directory().join(FILE_NAME);
        write(&target, br#"{"op":"openFile","path":"a.ts"}"#.as_slice()).unwrap();
        assert!(write(&target, vec![b' '; (MAX_INPUT + 1) as usize].as_slice()).is_err());
        assert_eq!(
            take(probe.directory()),
            Some(AgentCommand::OpenFile {
                path: "a.ts".into()
            })
        );
        assert!(write(&probe.directory().join("usage.json"), b"{}".as_slice()).is_err());
        let other = tempfile::tempdir().unwrap();
        assert!(write(&other.path().join(FILE_NAME), b"{}".as_slice()).is_err());
    }

    #[test]
    fn take_yields_each_command_once_and_leaves_nothing_behind() {
        let probe = Probe::new().unwrap();
        let target = probe.directory().join(FILE_NAME);
        assert_eq!(take(probe.directory()), None);
        for _ in 0..2 {
            write(&target, br#"{"op":"openFile","path":"a.ts"}"#.as_slice()).unwrap();
            assert_eq!(
                take(probe.directory()),
                Some(AgentCommand::OpenFile {
                    path: "a.ts".into()
                })
            );
            assert_eq!(take(probe.directory()), None);
        }
        assert!(!probe.directory().join("command.taken").exists());
    }
}
