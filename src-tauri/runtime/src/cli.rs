use crate::{client, error, protocol::*, server, storage, Result};
use std::{
    io::{self, BufRead},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

const HELP: &str = "Emdeck session server\n\n  emdeck-session start          Start the detached server\n  emdeck-session server         Run the server in the foreground\n  emdeck-session status         List workspaces, panes and agent states\n  emdeck-session stop           Stop the server AND its terminals\n  emdeck-session request JSON   Execute a typed API action\n  emdeck-session rpc            Multiplex JSON requests over stdin/stdout (SSH)\n\nSet EMDECK_SESSION_HOME to isolate storage. Request JSON uses method/params.\nExamples:\n  {\"method\":\"workspace.create\",\"params\":{\"root\":\"/home/me/project\",\"name\":\"Project\"}}\n  {\"method\":\"session.snapshot\",\"params\":{\"after\":null,\"wait_ms\":0}}\nSee docs/PERSISTENT-AGENTS.md for pane and agent automation.\n";

pub fn run(args: Vec<String>, embedded: bool) -> Result<()> {
    if args.is_empty() || matches!(args[0].as_str(), "--help" | "help" | "-h") {
        print!("{HELP}");
        return Ok(());
    }
    let home = storage::home()?;
    let value = match args[0].as_str() {
        "hook-claude" => {
            // Hook observers fail open: never return Claude's blocking exit code.
            if let Err(e) = crate::hooks::claude() {
                eprintln!("Emdeck observer: {e}");
            }
            return Ok(());
        }
        "report" => {
            return crate::hooks::report(
                args.get(1)
                    .ok_or("Provide working, blocked, idle, done, unknown or stopped.")?,
                args.get(2).cloned(),
            )
        }
        "server" => return server::run(&home),
        "start" => client::start(&home, &std::env::current_exe().map_err(error)?, embedded)?,
        "status" => client::call(
            &home,
            Action::Snapshot {
                after: None,
                wait_ms: 0,
            },
        )?,
        "stop" => client::call(&home, Action::StopServer)?,
        "request" => client::call(
            &home,
            serde_json::from_str(args.get(1).ok_or("Provide an action as JSON.")?)
                .map_err(error)?,
        )?,
        "rpc" => return rpc(),
        _ => return Err(format!("Unknown session command.\n{HELP}")),
    };
    println!("{}", serde_json::to_string(&value).map_err(error)?);
    Ok(())
}
fn rpc() -> Result<()> {
    let home = storage::home()?;
    let output = Arc::new(Mutex::new(io::stdout()));
    let active = Arc::new(AtomicUsize::new(0));
    let mut reader = io::stdin().lock();
    loop {
        if reader.fill_buf().map_err(error)?.is_empty() {
            break;
        }
        let request: Request =
            serde_json::from_slice(&server::line(&mut reader, MAX_REQUEST)?).map_err(error)?;
        let output = output.clone();
        let active = active.clone();
        let home = home.clone();
        if active.load(Ordering::Relaxed) >= 96 {
            return Err("Too many concurrent bridge requests.".into());
        }
        active.fetch_add(1, Ordering::Relaxed);
        std::thread::spawn(move || {
            let result = if request.version != PROTOCOL {
                Err("Unsupported protocol version.".into())
            } else {
                client::call(&home, request.action)
            };
            let response = Response {
                version: PROTOCOL,
                id: request.id,
                result: result.as_ref().ok().cloned(),
                error: result.err(),
            };
            if let Ok(mut output) = output.lock() {
                let _ = server::send(&mut *output, &response, MAX_RESPONSE);
            }
            active.fetch_sub(1, Ordering::Relaxed);
        });
    }
    // A finite stdin stream is useful for automation too. Finish responses to
    // already accepted frames before the CLI process exits on EOF.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(35);
    while active.load(Ordering::Relaxed) != 0 && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    Ok(())
}
