use crate::services::workspace::{err, Result};
use crate::{
    services::{markdown, workspace},
    state::Projects,
};
use tauri::State;
#[tauri::command]
pub(crate) async fn read_directory(
    window: tauri::Window,
    root: String,
    path: String,
    projects: State<'_, Projects>,
) -> Result<Vec<workspace::Entry>> {
    workspace::list(&projects.root(window.label(), &root)?, &path)
}
#[tauri::command]
pub(crate) async fn read_file(
    window: tauri::Window,
    root: String,
    path: String,
    projects: State<'_, Projects>,
) -> Result<workspace::Document> {
    workspace::read(&projects.root(window.label(), &root)?, &path)
}
#[tauri::command]
pub(crate) async fn read_image(
    window: tauri::Window,
    root: String,
    path: String,
    projects: State<'_, Projects>,
) -> Result<String> {
    markdown::image(&projects.root(window.label(), &root)?, &path)
}
#[tauri::command]
pub(crate) async fn open_external_url(url: String) -> Result<()> {
    markdown::open_external(&url)
}
#[tauri::command]
pub(crate) async fn save_file(
    window: tauri::Window,
    root: String,
    path: String,
    content: String,
    revision: String,
    projects: State<'_, Projects>,
) -> Result<workspace::Document> {
    workspace::save(
        &projects.root(window.label(), &root)?,
        &path,
        &content,
        &revision,
    )
}
#[tauri::command]
pub(crate) async fn create_entry(
    window: tauri::Window,
    root: String,
    path: String,
    directory: bool,
    projects: State<'_, Projects>,
) -> Result<()> {
    workspace::create(&projects.root(window.label(), &root)?, &path, directory)
}
#[tauri::command]
pub(crate) async fn rename_entry(
    window: tauri::Window,
    root: String,
    from: String,
    to: String,
    projects: State<'_, Projects>,
) -> Result<()> {
    workspace::rename(&projects.root(window.label(), &root)?, &from, &to)
}
#[tauri::command]
pub(crate) async fn copy_entry(
    window: tauri::Window,
    root: String,
    from: String,
    to: String,
    projects: State<'_, Projects>,
) -> Result<()> {
    workspace::copy(&projects.root(window.label(), &root)?, &from, &to)
}
#[tauri::command]
pub(crate) async fn trash_entry(
    window: tauri::Window,
    root: String,
    path: String,
    projects: State<'_, Projects>,
) -> Result<()> {
    workspace::remove(&projects.root(window.label(), &root)?, &path)
}
#[tauri::command]
pub(crate) async fn reveal_entry(
    window: tauri::Window,
    root: String,
    path: String,
    projects: State<'_, Projects>,
) -> Result<()> {
    let path = workspace::resolve(&projects.root(window.label(), &root)?, &path, false)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let display = path
            .to_string_lossy()
            .trim_start_matches("\\\\?\\")
            .to_owned();
        std::process::Command::new("explorer.exe")
            .arg(if path.is_dir() {
                display
            } else {
                format!("/select,{display}")
            })
            .creation_flags(0x08000000)
            .spawn()
            .map_err(err)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(err)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(if path.is_dir() {
                path.as_path()
            } else {
                path.parent().ok_or("Invalid parent")?
            })
            .spawn()
            .map_err(err)?;
    }
    Ok(())
}
