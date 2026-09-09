use crate::services::workspace::{err, Result};
use crate::{services::terminal, state::Projects};
use serde::Serialize;
use std::{path::PathBuf, sync::atomic::Ordering};
use tauri::State;
#[derive(Serialize)]
pub(crate) struct Project {
    root: String,
    name: String,
}
#[tauri::command]
pub(crate) async fn open_project(
    window: tauri::Window,
    path: String,
    projects: State<'_, Projects>,
) -> Result<Project> {
    let root = PathBuf::from(&path).canonicalize().map_err(err)?;
    if !root.is_dir() {
        return Err("Select a project folder.".into());
    }
    projects.authorize(window.label(), root.clone())?;
    let name = root
        .file_name()
        .unwrap_or(root.as_os_str())
        .to_string_lossy()
        .into_owned();
    Ok(Project {
        root: root.to_string_lossy().into_owned(),
        name,
    })
}

#[tauri::command]
pub(crate) fn startup_project(
    window: tauri::Window,
    projects: State<'_, Projects>,
) -> Result<Option<String>> {
    Ok(projects
        .initial
        .lock()
        .map_err(err)?
        .get(window.label())
        .cloned())
}

#[tauri::command]
pub(crate) async fn open_project_window(
    app: tauri::AppHandle,
    path: String,
    projects: State<'_, Projects>,
    terminals: State<'_, terminal::WindowTerminals>,
) -> Result<String> {
    let root = PathBuf::from(path).canonicalize().map_err(err)?;
    if !root.is_dir() {
        return Err("Select a project folder.".into());
    }
    let label = format!(
        "workspace-{}",
        projects.next_window.fetch_add(1, Ordering::Relaxed)
    );
    projects.activate(&label, &root)?;
    // Keep the path in native state rather than injecting it into HTML or a URL.
    projects
        .initial
        .lock()
        .map_err(err)?
        .insert(label.clone(), root.to_string_lossy().into_owned());
    if let Err(error) = terminals.register(&label) {
        projects.forget(&label);
        return Err(error);
    }
    let name = root
        .file_name()
        .unwrap_or(root.as_os_str())
        .to_string_lossy();
    let result =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(format!("{name} — Emdeck"))
            .inner_size(1440.0, 960.0)
            .min_inner_size(900.0, 640.0)
            .background_color(tauri::window::Color(18, 20, 24, 255))
            .build();
    if let Err(error) = result {
        projects.forget(&label);
        terminals.close_window(&label);
        return Err(err(error));
    }
    Ok(label)
}
