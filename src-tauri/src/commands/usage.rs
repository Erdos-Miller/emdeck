use crate::services::workspace::{err, Result};
use emdeck_session::{codex::UsageCache, usage::AccountUsage};
use tauri::Manager;
#[tauri::command]
pub(crate) async fn codex_account_usage(app: tauri::AppHandle) -> Result<AccountUsage> {
    tauri::async_runtime::spawn_blocking(move || app.state::<UsageCache>().read())
        .await
        .map_err(err)?
}
