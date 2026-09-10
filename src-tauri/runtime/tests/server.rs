use emdeck_session::{client, protocol::*, server, ssh, storage};
use serde_json::json;
use std::{
    io::BufReader,
    net::TcpStream,
    path::Path,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

struct Fixture {
    directory: tempfile::TempDir,
    child: Child,
}
impl Fixture {
    fn new() -> Self {
        Self::with_environment(&[])
    }
    fn with_environment(environment: &[(&str, &str)]) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let child = Self::spawn_with_environment(directory.path(), environment);
        let fixture = Self { directory, child };
        fixture.ready();
        fixture
    }
    fn spawn(home: &Path) -> Child {
        Self::spawn_with_environment(home, &[])
    }
    fn spawn_with_environment(home: &Path, environment: &[(&str, &str)]) -> Child {
        let mut command = Command::new(env!("CARGO_BIN_EXE_emdeck-session"));
        command
            .arg("server")
            .env("EMDECK_SESSION_HOME", home)
            .env("HOME", home)
            .envs(environment.iter().copied())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        command.spawn().unwrap()
    }
    fn ready(&self) {
        until(|| client::call(self.directory.path(), Action::Ping).is_ok());
    }
    fn call(&self, action: Action) -> serde_json::Value {
        client::call(self.directory.path(), action).unwrap()
    }
    fn pane(&self, command: &str) -> PaneInfo {
        let root = self.directory.path().to_string_lossy().into_owned();
        let workspace = self.call(Action::WorkspaceCreate {
            root: root.clone(),
            name: "Fixture".into(),
        });
        serde_json::from_value(self.call(Action::PaneCreate {
            launch: Launch {
                workspace_id: workspace["id"].as_str().unwrap().into(),
                name: "Test shell".into(),
                cwd: root,
                command: command.into(),
                shell: String::new(),
                resume_on_restart: false,
            },
            cols: 80,
            rows: 20,
        }))
        .unwrap()
    }
    fn read(&self, id: &str) -> ReadResult {
        serde_json::from_value(self.call(Action::Read {
            id: id.into(),
            after: None,
            wait_ms: 0,
        }))
        .unwrap()
    }
    fn restart(&mut self) {
        self.call(Action::StopServer);
        self.child.wait().unwrap();
        self.child = Self::spawn(self.directory.path());
        self.ready();
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = client::call(self.directory.path(), Action::StopServer);
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn until(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while !condition() {
        assert!(Instant::now() < deadline, "Condition timed out");
        thread::sleep(Duration::from_millis(80));
    }
}
fn waiting_command() -> &'static str {
    if cfg!(windows) {
        "Write-Output 'READY'; Start-Sleep -Seconds 120"
    } else {
        "printf 'READY\\n'; sleep 120"
    }
}

#[test]
fn detached_terminal_titles_reach_snapshots_and_reconnecting_clients() {
    let fixture = Fixture::new();
    let command = if cfg!(windows) {
        "[Console]::Write(([char]27).ToString() + ']2;Fix detached task' + [char]7); Start-Sleep -Seconds 120"
    } else {
        "printf '\\033]2;Fix detached task\\007'; sleep 120"
    };
    let pane = fixture.pane(command);
    until(|| fixture.read(&pane.id).pane.title.as_deref() == Some("Fix detached task"));
    let snapshot: Snapshot = serde_json::from_value(fixture.call(Action::Snapshot {
        after: None,
        wait_ms: 0,
    }))
    .unwrap();
    assert_eq!(
        snapshot.panes[0].title.as_deref(),
        Some("Fix detached task")
    );
    fixture.call(Action::Attach {
        id: pane.id.clone(),
        client: "first".into(),
        takeover: false,
    });
    fixture.call(Action::Detach {
        id: pane.id.clone(),
        client: "first".into(),
    });
    let attached: PaneInfo = serde_json::from_value(fixture.call(Action::Attach {
        id: pane.id.clone(),
        client: "second".into(),
        takeover: false,
    }))
    .unwrap();
    assert_eq!(attached.title.as_deref(), Some("Fix detached task"));
    let replay = fixture.read(&pane.id);
    assert!(replay.reset);
    assert_eq!(replay.pane.title.as_deref(), Some("Fix detached task"));
    // Older saved sessions and servers omit this optional metadata.
    let mut legacy = serde_json::to_value(attached).unwrap();
    legacy.as_object_mut().unwrap().remove("title");
    assert!(serde_json::from_value::<PaneInfo>(legacy)
        .unwrap()
        .title
        .is_none());
}

#[test]
fn terminal_colors_ignore_launcher_flags() {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let fixture = Fixture::with_environment(&[
        ("EMDECK_COLOR_FIXTURE", "preserved"),
        ("NO_COLOR", "1"),
        ("FORCE_COLOR", "0"),
        ("CLICOLOR", "0"),
        ("CLICOLOR_FORCE", "0"),
        ("NODE_DISABLE_COLORS", "1"),
        ("TERM", "dumb"),
        ("COLORTERM", ""),
    ]);
    std::fs::write(
        fixture.directory.path().join("terminal-colors.mjs"),
        include_str!("../../../tests/fixtures/terminal-colors.mjs"),
    )
    .unwrap();
    let pane = fixture.pane("node terminal-colors.mjs");
    until(|| !fixture.read(&pane.id).pane.running);
    let result = fixture.read(&pane.id);
    assert!(result.text.contains("EMDECK_COLOR_OK"), "{}", result.text);
    assert!(result.text.contains("TRUECOLOR_OK"), "{}", result.text);
    let mut parser = vt100::Parser::new(20, 80, 0);
    parser.process(&STANDARD.decode(result.data).unwrap());
    let foregrounds: Vec<_> = (0..20)
        .flat_map(|row| (0..80).map(move |col| (row, col)))
        .filter_map(|(row, col)| parser.screen().cell(row, col))
        .filter(|cell| !cell.contents().trim().is_empty())
        .map(|cell| cell.fgcolor())
        .collect();
    assert!(
        foregrounds.contains(&vt100::Color::Idx(1)),
        "{foregrounds:?}"
    );
    assert!(
        foregrounds.contains(&vt100::Color::Rgb(17, 34, 51)),
        "{foregrounds:?}"
    );
}

#[test]
fn disconnected_clients_rejoin_same_process_and_cold_restart_restores_without_reexecution() {
    let mut fixture = Fixture::new();
    let command = if cfg!(windows) {
        "Add-Content -Path launched.txt -Value once; $i=0; while ($true) { Write-Output ('TICK-' + $i); $i++; Start-Sleep -Milliseconds 150 }"
    } else {
        "echo once >> launched.txt; i=0; while true; do echo TICK-$i; i=$((i+1)); sleep 0.15; done"
    };
    let pane = fixture.pane(command);
    until(|| fixture.read(&pane.id).text.contains("TICK-"));
    fixture.call(Action::Attach {
        id: pane.id.clone(),
        client: "first".into(),
        takeover: false,
    });
    fixture.call(Action::Detach {
        id: pane.id.clone(),
        client: "first".into(),
    });
    let initial = fixture.read(&pane.id).sequence;
    thread::sleep(Duration::from_millis(500));
    let rejoined = fixture.read(&pane.id);
    assert!(rejoined.sequence > initial);
    assert_eq!(rejoined.pane.generation, pane.generation);
    assert!(rejoined.pane.running);
    fixture.call(Action::Attach {
        id: pane.id.clone(),
        client: "second".into(),
        takeover: false,
    });
    fixture.restart();
    let snapshot: Snapshot = serde_json::from_value(fixture.call(Action::Snapshot {
        after: None,
        wait_ms: 0,
    }))
    .unwrap();
    assert_eq!(snapshot.panes.len(), 1);
    assert!(snapshot.panes[0].restored);
    assert!(!snapshot.panes[0].running);
    assert_eq!(
        std::fs::read_to_string(fixture.directory.path().join("launched.txt"))
            .unwrap()
            .lines()
            .count(),
        1
    );
}

#[test]
fn leases_reports_waits_and_generation_guards_are_enforced() {
    let fixture = Fixture::new();
    let pane = fixture.pane(waiting_command());
    until(|| fixture.read(&pane.id).text.contains("READY"));
    fixture.call(Action::Attach {
        id: pane.id.clone(),
        client: "one".into(),
        takeover: false,
    });
    let other = Action::Attach {
        id: pane.id.clone(),
        client: "two".into(),
        takeover: false,
    };
    assert!(client::call(fixture.directory.path(), other)
        .unwrap_err()
        .contains("Another client"));
    fixture.call(Action::Attach {
        id: pane.id.clone(),
        client: "two".into(),
        takeover: true,
    });
    assert!(client::call(
        fixture.directory.path(),
        Action::Input {
            id: pane.id.clone(),
            client: "one".into(),
            text: "x".into()
        }
    )
    .is_err());
    assert!(client::call(
        fixture.directory.path(),
        Action::Prompt {
            id: pane.id.clone(),
            generation: pane.generation.clone(),
            text: "not sent".into()
        }
    )
    .is_err());
    fixture.call(Action::Report {
        id: pane.id.clone(),
        generation: pane.generation.clone(),
        state: AgentState::Blocked,
        session_id: None,
    });
    let wait = fixture.call(Action::Wait {
        id: pane.id.clone(),
        generation: pane.generation.clone(),
        states: vec![AgentState::Blocked],
        timeout_ms: 1000,
    });
    assert_eq!(wait["matched"], true);
    assert!(client::call(
        fixture.directory.path(),
        Action::Prompt {
            id: pane.id.clone(),
            generation: pane.generation.clone(),
            text: "not sent".into()
        }
    )
    .is_err());
    assert!(client::call(
        fixture.directory.path(),
        Action::Report {
            id: pane.id.clone(),
            generation: "old".into(),
            state: AgentState::Idle,
            session_id: None
        }
    )
    .is_err());
    fixture.call(Action::PaneStop {
        id: pane.id.clone(),
    });
    until(|| !fixture.read(&pane.id).pane.running);
    fixture.call(Action::PaneRestart {
        id: pane.id.clone(),
        resume: false,
    });
    assert!(client::call(
        fixture.directory.path(),
        Action::Wait {
            id: pane.id,
            generation: pane.generation,
            states: vec![AgentState::Idle],
            timeout_ms: 100
        }
    )
    .unwrap_err()
    .contains("occupant changed"));
}

#[test]
fn protocol_authentication_size_and_private_server_lock() {
    let fixture = Fixture::new();
    let endpoint = storage::endpoint(fixture.directory.path()).unwrap();
    assert!(storage::prepare(fixture.directory.path()).is_err());
    let request = Request {
        version: PROTOCOL,
        id: "test".into(),
        token: "wrong".into(),
        action: Action::Ping,
    };
    let mut stream = TcpStream::connect(("127.0.0.1", endpoint.port)).unwrap();
    server::send(&mut stream, &request, MAX_REQUEST).unwrap();
    let response: Response =
        serde_json::from_slice(&server::line(&mut BufReader::new(stream), MAX_RESPONSE).unwrap())
            .unwrap();
    assert!(response.result.is_none());
    assert!(response.error.unwrap().contains("authentication"));
    assert!(server::line(&mut BufReader::new(&b"123456\n"[..]), 4).is_err());
    let serialized = serde_json::to_vec(&Request {
        token: endpoint.token,
        ..request
    })
    .unwrap();
    assert!(serde_json::from_slice::<Request>(&serialized).is_ok());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(fixture.directory.path().join("endpoint.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    fixture.call(Action::Ping);
}

#[test]
fn ssh_arguments_reject_shell_injection_and_never_forward_agent() {
    for malicious in ["-oProxyCommand=x", "host;touch", "$(whoami)", "x\n", "x&y"] {
        assert!(ssh::args(&ssh::Target {
            host: malicious.into(),
            port: None,
            binary: "emdeck-session".into()
        })
        .is_err());
        assert!(ssh::args(&ssh::Target {
            host: "box".into(),
            port: None,
            binary: malicious.into()
        })
        .is_err());
    }
    let args = ssh::args(&ssh::Target {
        host: "dev@box".into(),
        port: Some(2222),
        binary: "C:/Emdeck Tools/emdeck-session.exe".into(),
    })
    .unwrap();
    assert!(args.contains(&"StrictHostKeyChecking=yes".into()));
    assert!(args.contains(&"ForwardAgent=no".into()));
    assert_eq!(
        args.last().unwrap(),
        "\"C:/Emdeck Tools/emdeck-session.exe\" rpc"
    );
}

#[test]
fn controlled_input_reaches_a_real_detached_terminal() {
    let fixture = Fixture::new();
    let command = if cfg!(windows) {
        "$value = Read-Host 'Fixture input'; Set-Content -LiteralPath 'input.txt' -Value $value"
    } else {
        "printf 'Fixture input: '; read value; printf '%s' \"$value\" > input.txt"
    };
    let pane = fixture.pane(command);
    until(|| fixture.read(&pane.id).text.contains("Fixture input"));
    fixture.call(Action::Attach {
        id: pane.id.clone(),
        client: "input-test".into(),
        takeover: false,
    });
    fixture.call(Action::Input {
        id: pane.id,
        client: "input-test".into(),
        text: "ordered-input-123\r".into(),
    });
    let file = fixture.directory.path().join("input.txt");
    until(|| std::fs::read_to_string(&file).is_ok_and(|text| text.trim() == "ordered-input-123"));
}

#[test]
fn slow_clients_resynchronize_after_output_ring_eviction() {
    let fixture = Fixture::new();
    let command = if cfg!(windows) {
        "1..9000 | ForEach-Object { '0123456789' * 8 }; Write-Output 'FINAL-SCREEN-MARKER'"
    } else {
        "i=0; while [ $i -lt 9000 ]; do printf '%080d\\n' $i; i=$((i+1)); done; echo FINAL-SCREEN-MARKER"
    };
    let pane = fixture.pane(command);
    until(|| !fixture.read(&pane.id).pane.running);
    let replay: ReadResult = serde_json::from_value(fixture.call(Action::Read {
        id: pane.id,
        after: Some(0),
        wait_ms: 0,
    }))
    .unwrap();
    assert!(replay.reset);
    assert!(replay.text.contains("FINAL-SCREEN-MARKER"));
    assert!(replay.data.len() < MAX_RESPONSE);
}

#[test]
fn request_roundtrips_and_resume_requires_explicit_native_reference() {
    let action: Action = serde_json::from_value(
        json!({"method":"pane.read", "params":{"id":"fixture", "after":null, "wait_ms":0}}),
    )
    .unwrap();
    assert!(matches!(action, Action::Read { after: None, .. }));
    let mut agent = emdeck_session::agent::initial("claude");
    assert!(emdeck_session::agent::resume_args(&agent).is_none());
    agent.session_id = Some("a-valid_session-123".into());
    assert_eq!(
        emdeck_session::agent::resume_args(&agent).unwrap(),
        ["claude", "--resume", "a-valid_session-123"]
    );
    agent.session_id = Some("--dangerous".into());
    assert!(emdeck_session::agent::resume_args(&agent).is_none());
}

#[test]
fn detached_launcher_and_multiplexed_cli_survive_client_exit() {
    use std::io::Write;
    let directory = tempfile::tempdir().unwrap();
    let binary = Path::new(env!("CARGO_BIN_EXE_emdeck-session"));
    client::start(directory.path(), binary, false).unwrap();
    let result = std::panic::catch_unwind(|| {
        let mut command = Command::new(binary);
        command
            .arg("rpc")
            .env("EMDECK_SESSION_HOME", directory.path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut bridge = command.spawn().unwrap();
        let mut input = bridge.stdin.take().unwrap();
        // A long poll cannot block independent input/metadata actions.
        writeln!(input, "{}", json!({"version":1,"id":"slow","method":"session.snapshot","params":{"after":1,"wait_ms":1000}})).unwrap();
        writeln!(
            input,
            "{}",
            json!({"version":1,"id":"fast","method":"ping"})
        )
        .unwrap();
        drop(input);
        let output = bridge.wait_with_output().unwrap();
        assert!(output.status.success());
        let replies: Vec<Response> = String::from_utf8(output.stdout)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(replies.len(), 2);
        assert_eq!(replies[0].id, "fast");
        assert_eq!(replies[1].id, "slow");
        client::call(directory.path(), Action::Ping).unwrap();
    });
    client::call(directory.path(), Action::StopServer).unwrap();
    until(|| !directory.path().join("endpoint.json").exists());
    result.unwrap();
}
