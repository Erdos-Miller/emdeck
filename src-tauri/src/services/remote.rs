use super::terminal::program_command;
use super::workspace::Result;
use portable_pty::CommandBuilder;
use serde::Deserialize;
use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Backend {
    Cmux,
    Tmux,
    Shell,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SshTarget {
    backend: Backend,
    host: String,
    port: Option<u16>,
    session: String,
    binary: String,
    command: String,
}

fn identifier(value: &str, max: usize, extra: &[u8]) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || extra.contains(&b))
}

pub(crate) fn ssh_args(target: &SshTarget) -> Result<Vec<String>> {
    if !identifier(&target.host, 255, b"_.@:[-]")
        || !target.host.as_bytes()[0].is_ascii_alphanumeric()
    {
        return Err(
            "Use an SSH host alias or user@hostname, without options or shell syntax.".into(),
        );
    }
    if target.port == Some(0) {
        return Err("SSH port must be between 1 and 65535.".into());
    }
    if target.command.len() > 8192 || target.command.contains('\0') {
        return Err("Remote command is too long or contains a null character.".into());
    }
    let mut args: Vec<String> = [
        "-tt",
        "-o",
        "StrictHostKeyChecking=ask",
        "-o",
        "ForwardAgent=no",
        "-o",
        "ClearAllForwardings=yes",
        "-o",
        "PermitLocalCommand=no",
        "-o",
        "ServerAliveInterval=20",
        "-o",
        "ServerAliveCountMax=3",
        "-o",
        "EscapeChar=none",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    if let Some(port) = target.port {
        args.extend(["-p".into(), port.to_string()]);
    }
    args.extend(["--".into(), target.host.clone()]);
    match target.backend {
        Backend::Shell => {
            // The user explicitly supplies remote-shell syntax. This remains one
            // argv value passed directly to OpenSSH, never a local shell command.
            if !target.command.trim().is_empty() {
                args.push(target.command.clone());
            }
        }
        Backend::Cmux | Backend::Tmux => {
            if !identifier(&target.session, 100, b"_.-") || target.session.starts_with(['-', '.']) {
                return Err(
                    "Use a simple session name (letters, numbers, underscores, dots, hyphens)."
                        .into(),
                );
            }
            if !identifier(&target.binary, 512, b"_/.-") || target.binary.starts_with('-') {
                return Err(
                    "Use a multiplexer binary name or POSIX path without spaces or shell syntax."
                        .into(),
                );
            }
            // All tokens are validated, including those OpenSSH joins for the
            // remote shell. Attach only: never create/kill a server or evict clients.
            args.push(match target.backend {
                Backend::Cmux => format!("{} attach --session {}", target.binary, target.session),
                Backend::Tmux => format!("{} attach-session -t ={}", target.binary, target.session),
                Backend::Shell => unreachable!(),
            });
        }
    }
    Ok(args)
}

fn ssh_executable(paths: &OsStr, name: &str) -> Result<PathBuf> {
    // Resolve before setting the project's cwd. In particular, do not let
    // Windows fall back to a same-named executable in an opened project.
    std::env::split_paths(paths)
        .filter(|directory| directory.is_absolute())
        .map(|directory| directory.join(name))
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            "OpenSSH was not found in PATH. Install an OpenSSH client and restart Emdeck.".into()
        })
}

pub(crate) fn command(target: &SshTarget, cwd: &Path) -> Result<CommandBuilder> {
    let args = ssh_args(target)?;
    let executable = ssh_executable(
        &std::env::var_os("PATH").unwrap_or_default(),
        if cfg!(windows) { "ssh.exe" } else { "ssh" },
    )?;
    let mut command = program_command(executable, cwd);
    command.args(args);
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolves_only_explicit_absolute_path_directories() {
        let directory = std::env::temp_dir().join(format!(
            "emdeck-ssh-path-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let executable = directory.join("ssh-fixture");
        std::fs::write(&executable, b"fixture, never executed").unwrap();
        let paths = std::env::join_paths([Path::new("."), directory.as_path()]).unwrap();
        assert_eq!(ssh_executable(&paths, "ssh-fixture").unwrap(), executable);
        assert!(ssh_executable(OsStr::new("."), "ssh-fixture").is_err());
        std::fs::remove_file(executable).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
    fn target() -> SshTarget {
        SshTarget {
            backend: Backend::Cmux,
            host: "dev@buildbox".into(),
            port: None,
            session: "agents".into(),
            binary: "cmux".into(),
            command: String::new(),
        }
    }
    #[test]
    fn attaches_without_creating_sessions_or_detaching_other_clients() {
        let mut target = target();
        let args = ssh_args(&target).unwrap();
        assert_eq!(
            &args[args.len() - 3..],
            ["--", "dev@buildbox", "cmux attach --session agents"]
        );
        assert!(args.contains(&"StrictHostKeyChecking=ask".into()));
        assert!(args.contains(&"ForwardAgent=no".into()));
        assert!(args.contains(&"ClearAllForwardings=yes".into()));
        target.backend = Backend::Tmux;
        target.binary = "/usr/bin/tmux".into();
        target.port = Some(2222);
        let args = ssh_args(&target).unwrap();
        assert_eq!(
            args.last().unwrap(),
            "/usr/bin/tmux attach-session -t =agents"
        );
        assert!(args.windows(2).any(|a| a == ["-p", "2222"]));
    }
    #[test]
    fn rejects_options_and_remote_shell_injection_in_attach_fields() {
        for field in ["host", "session", "binary"] {
            for value in [
                "-oProxyCommand=touch",
                "name;touch /tmp/a",
                "$(whoami)",
                "a\ncommand",
                "a b",
                "",
                "a'",
                "x&y",
            ] {
                let mut t = target();
                match field {
                    "host" => t.host = value.into(),
                    "session" => t.session = value.into(),
                    _ => t.binary = value.into(),
                }
                assert!(ssh_args(&t).is_err(), "{field}: {value}");
            }
        }
    }
    #[test]
    fn explicit_custom_command_is_a_single_remote_argument() {
        let mut t = target();
        t.backend = Backend::Shell;
        assert_eq!(ssh_args(&t).unwrap().last().unwrap(), "dev@buildbox");
        t.command = "cd '/my project' && codex resume".into();
        assert_eq!(ssh_args(&t).unwrap().last().unwrap(), &t.command);
        t.port = Some(0);
        assert!(ssh_args(&t).is_err());
    }
}
