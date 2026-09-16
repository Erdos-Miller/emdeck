pub mod agent;
pub mod attachments;
pub mod cli;
pub mod client;
pub mod codex;
pub mod command;
pub mod engine;
pub mod hooks;
mod private;
mod process;
pub use process::killer as child_killer;
pub mod protocol;
pub mod remote;
mod screen;
pub mod server;
pub mod ssh;
pub mod storage;
pub mod terminal;
mod terminal_environment;
pub mod usage;
pub use private::protect as protect_private_path;
pub use terminal_environment::configure_terminal_environment;

pub type Result<T> = std::result::Result<T, String>;
pub fn error(value: impl std::fmt::Display) -> String {
    value.to_string()
}
