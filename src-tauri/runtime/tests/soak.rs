use emdeck_session::{client, protocol::*};
use std::{
    path::Path,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

struct Server {
    directory: tempfile::TempDir,
    child: Child,
}
impl Server {
    fn start() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let mut command = Command::new(env!("CARGO_BIN_EXE_emdeck-session"));
        command
            .arg("server")
            .env("EMDECK_SESSION_HOME", directory.path())
            .env("HOME", directory.path())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let child = command.spawn().unwrap();
        let server = Self { directory, child };
        let deadline = Instant::now() + Duration::from_secs(20);
        while client::call(server.home(), Action::Ping).is_err() {
            assert!(Instant::now() < deadline, "Server did not start");
            std::thread::sleep(Duration::from_millis(80));
        }
        server
    }
    fn home(&self) -> &Path {
        self.directory.path()
    }
    fn call(&self, action: Action) -> serde_json::Value {
        client::call(self.home(), action).unwrap()
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        let _ = client::call(self.home(), Action::StopServer);
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
#[ignore = "Opt-in six-pane soak; set EMDECK_SOAK_SECONDS, defaults to two hours"]
fn six_panes_stream_resize_and_shutdown() {
    let seconds = std::env::var("EMDECK_SOAK_SECONDS")
        .unwrap_or_else(|_| "7200".into())
        .parse::<u64>()
        .expect("EMDECK_SOAK_SECONDS must be an integer");
    assert!((5..=10800).contains(&seconds));
    let server = Server::start();
    let root = server.home().to_string_lossy().into_owned();
    let workspace = server.call(Action::WorkspaceCreate {
        root: root.clone(),
        name: "Soak".into(),
    });
    let command = if cfg!(windows) {
        "while ($true) { [Console]::WriteLine('emdeck synthetic terminal output'); Start-Sleep -Milliseconds 50 }"
    } else {
        "while :; do printf 'emdeck synthetic terminal output\\n'; sleep 0.05; done"
    };
    let panes: Vec<PaneInfo> = (0..6)
        .map(|index| {
            serde_json::from_value(server.call(Action::PaneCreate {
                launch: Launch {
                    workspace_id: workspace["id"].as_str().unwrap().into(),
                    name: format!("Soak {index}"),
                    cwd: root.clone(),
                    shell: String::new(),
                    command: command.into(),
                    resume_on_restart: false,
                    usage_reporting: false,
                    args: Vec::new(),
                },
                cols: 80,
                rows: 24,
            }))
            .unwrap()
        })
        .collect();
    for pane in &panes {
        server.call(Action::Attach {
            id: pane.id.clone(),
            client: "soak".into(),
            takeover: false,
        });
    }
    let start = Instant::now();
    let mut resized = Instant::now();
    let mut report = Instant::now();
    let mut cursors = vec![None; panes.len()];
    let mut sequences = vec![0_u64; panes.len()];
    while start.elapsed() < Duration::from_secs(seconds) {
        for (index, pane) in panes.iter().enumerate() {
            let read: ReadResult = serde_json::from_value(server.call(Action::Read {
                id: pane.id.clone(),
                after: cursors[index],
                wait_ms: 500,
                commands_after: None,
            }))
            .unwrap();
            assert!(read.pane.running, "Pane {index} exited during soak");
            cursors[index] = Some(read.sequence);
            sequences[index] = read.sequence;
        }
        if resized.elapsed() > Duration::from_secs(2) {
            for pane in &panes {
                server.call(Action::Resize {
                    id: pane.id.clone(),
                    client: "soak".into(),
                    cols: 80 + (start.elapsed().as_secs() % 40) as u16,
                    rows: 30,
                });
            }
            resized = Instant::now();
        }
        if report.elapsed() > Duration::from_secs(60) {
            println!(
                "Soak {} seconds; output frames per pane: {sequences:?}",
                start.elapsed().as_secs()
            );
            report = Instant::now();
        }
    }
    assert!(sequences.iter().all(|value| *value > 10));
    for pane in &panes {
        server.call(Action::PaneStop {
            id: pane.id.clone(),
        });
    }
    let deadline = Instant::now() + Duration::from_secs(30);
    for pane in &panes {
        while client::call(
            server.home(),
            Action::Read {
                id: pane.id.clone(),
                after: None,
                wait_ms: 0,
                commands_after: None,
            },
        )
        .map(|value| value["pane"]["running"] == true)
        .unwrap_or(false)
        {
            assert!(Instant::now() < deadline, "A pane did not stop");
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    println!("Six-pane soak passed after {seconds}s; output frames per pane: {sequences:?}");
}
