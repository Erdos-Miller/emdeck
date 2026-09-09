use crate::{
    client, error,
    protocol::{Action, AgentState, MAX_REQUEST},
    storage, Result,
};
use serde_json::Value;
use std::io::Read;

pub fn claude_action(value: &Value, id: String, generation: String) -> Result<Option<Action>> {
    // Subagents share the environment but must not replace the parent pane's
    // identity or mark it idle when only a child has finished.
    if value.get("agent_id").is_some() {
        return Ok(None);
    }
    let state = match value["hook_event_name"].as_str().unwrap_or("") {
        "SessionStart" => AgentState::Unknown,
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure"
        | "ElicitationResult" => AgentState::Working,
        "PermissionRequest" | "Elicitation" => AgentState::Blocked,
        "Stop" => AgentState::Idle,
        "StopFailure" => AgentState::Unknown,
        "Notification" if value["notification_type"] == "permission_prompt" => AgentState::Blocked,
        "Notification" if value["notification_type"] == "idle_prompt" => AgentState::Idle,
        _ => return Ok(None),
    };
    Ok(Some(Action::Report {
        id,
        generation,
        state,
        session_id: value["session_id"].as_str().map(str::to_owned),
    }))
}
pub fn claude() -> Result<()> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take((MAX_REQUEST + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() > MAX_REQUEST {
        return Err("Hook payload exceeds its limit.".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(error)?;
    let id = std::env::var("EMDECK_PANE_ID").map_err(error)?;
    let generation = std::env::var("EMDECK_PANE_GENERATION").map_err(error)?;
    if let Some(action) = claude_action(&value, id, generation)? {
        client::call(&storage::home()?, action)?;
    }
    // No stdout: this observer never approves, denies, or changes agent decisions.
    Ok(())
}
pub fn report(state: &str, session_id: Option<String>) -> Result<()> {
    let state: AgentState = serde_json::from_value(Value::String(state.into())).map_err(error)?;
    client::call(
        &storage::home()?,
        Action::Report {
            id: std::env::var("EMDECK_PANE_ID").map_err(error)?,
            generation: std::env::var("EMDECK_PANE_GENERATION").map_err(error)?,
            state,
            session_id,
        },
    )?;
    Ok(())
}
