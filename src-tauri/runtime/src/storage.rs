use crate::{
    error, private,
    protocol::{PaneInfo, WorkspaceInfo},
    Result,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
pub struct Endpoint {
    pub port: u16,
    pub token: String,
    pub server_id: String,
    pub pid: u32,
}

#[derive(Default, Serialize, Deserialize)]
pub struct SavedState {
    pub version: u32,
    pub workspaces: Vec<WorkspaceInfo>,
    pub panes: Vec<PaneInfo>,
}

pub fn home() -> Result<PathBuf> {
    if let Some(directory) = std::env::var_os("EMDECK_SESSION_HOME") {
        let path = PathBuf::from(directory);
        if !path.is_absolute() {
            return Err("EMDECK_SESSION_HOME must be an absolute directory.".into());
        }
        return Ok(path);
    }
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|p| p.join("Emdeck"));
    #[cfg(not(windows))]
    let base = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local/state")))
        .map(|p| p.join("emdeck"));
    base.map(|p| p.join("sessions"))
        .ok_or("Cannot locate per-user session storage.".into())
}

pub fn prepare(path: &Path) -> Result<File> {
    if !path.is_absolute() {
        return Err("Session storage must use an absolute directory.".into());
    }
    fs::create_dir_all(path).map_err(error)?;
    private::protect(path)?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path.join("server.lock"))
        .map_err(error)?;
    lock.try_lock()
        .map_err(|_| "An Emdeck session server already owns this directory.".to_owned())?;
    Ok(lock)
}

pub fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path.parent().ok_or("Missing storage directory.")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(error)?;
    private::protect(temp.path())?;
    serde_json::to_writer(&mut temp, value).map_err(error)?;
    temp.flush().map_err(error)?;
    temp.as_file().sync_all().map_err(error)?;
    temp.persist(path).map_err(error)?;
    Ok(())
}

pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path, limit: u64) -> Result<T> {
    let metadata = fs::symlink_metadata(path).map_err(error)?;
    if metadata.len() > limit || !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Session state is not a regular file or exceeds its size limit.".into());
    }
    serde_json::from_slice(&fs::read(path).map_err(error)?).map_err(error)
}

pub fn endpoint(home: &Path) -> Result<Endpoint> {
    let endpoint: Endpoint = read_json(&home.join("endpoint.json"), 4096)?;
    if endpoint.port == 0
        || endpoint.token.len() != 64
        || !endpoint.token.bytes().all(|c| c.is_ascii_hexdigit())
    {
        return Err("Invalid session server endpoint. Start the session server again.".into());
    }
    Ok(endpoint)
}

pub fn load(home: &Path) -> Result<SavedState> {
    if !home.join("layout.json").exists() {
        return Ok(SavedState {
            version: 1,
            ..Default::default()
        });
    }
    let state: SavedState = read_json(&home.join("layout.json"), 8 * 1024 * 1024)?;
    if state.version != 1 || state.panes.len() > 64 || state.workspaces.len() > 64 {
        return Err(
            "Unsupported or oversized saved session layout. Its file has been left untouched."
                .into(),
        );
    }
    Ok(state)
}
