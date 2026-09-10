use emdeck_session::{
    agent, hooks,
    protocol::{Action, AgentState},
};
use serde_json::json;

#[test]
fn conservative_states_do_not_treat_silence_or_prose_as_completion() {
    let initial = agent::initial("claude");
    assert_eq!(
        agent::observe(&initial, "I will ask: would you like to proceed?").state,
        AgentState::Unknown
    );
    assert_eq!(
        agent::observe(&initial, "Do you want to allow this?\n1. Yes\n2. No").state,
        AgentState::Blocked
    );
    assert_eq!(
        agent::observe(&initial, "Working... esc to interrupt").state,
        AgentState::Working
    );
    assert_eq!(
        agent::observe(&initial, "❯\n? for shortcuts").state,
        AgentState::Idle
    );
    let mut report = initial;
    report.source = "report".into();
    report.state = AgentState::Blocked;
    assert_eq!(
        agent::observe(&report, "Working... esc to interrupt").state,
        AgentState::Blocked
    );
}
#[test]
fn lifecycle_hooks_pin_parent_identity_and_never_return_approval_decisions() {
    let value = json!({"hook_event_name":"PermissionRequest", "session_id":"session-123"});
    let action = hooks::claude_action(&value, "pane".into(), "generation".into())
        .unwrap()
        .unwrap();
    assert!(matches!(
        action,
        Action::Report {
            state: AgentState::Blocked,
            session_id: Some(_),
            ..
        }
    ));
    assert!(hooks::claude_action(
        &json!({"hook_event_name":"Stop", "agent_id":"child"}),
        "pane".into(),
        "gen".into()
    )
    .unwrap()
    .is_none());
    assert!(hooks::claude_action(
        &json!({"hook_event_name":"UnknownFutureEvent"}),
        "pane".into(),
        "gen".into()
    )
    .unwrap()
    .is_none());
}
