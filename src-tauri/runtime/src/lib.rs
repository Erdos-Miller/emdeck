pub mod agent;
pub mod cli;
pub mod client;
pub mod engine;
pub mod hooks;
mod private;
mod process;
pub use process::killer as child_killer;
pub mod protocol;
mod screen;
pub mod server;
pub mod ssh;
pub mod storage;
pub mod terminal;

pub type Result<T> = std::result::Result<T, String>;
pub fn error(value: impl std::fmt::Display) -> String {
    value.to_string()
}
