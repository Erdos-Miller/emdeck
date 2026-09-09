use crate::services::codex_usage;
use crate::services::workspace::{err, Result};
use tauri::Manager;
#[tauri::command]
pub(crate) async fn codex_account_usage(
    app: tauri::AppHandle,
) -> Result<codex_usage::AccountUsage> {
    tauri::async_runtime::spawn_blocking(move || app.state::<codex_usage::UsageCache>().read())
        .await
        .map_err(err)?
}
