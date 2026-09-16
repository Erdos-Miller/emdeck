use crate::Result;
use serde::{Deserialize, Serialize};

const MAX_TEXT: usize = 512;
pub const MAX_PENDING: usize = 32;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum AgentCommand {
    ShowDiff {
        reference: String,
        #[serde(default)]
        working: bool,
    },
    OpenFile {
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        line: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        column: Option<u32>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandEntry {
    pub sequence: u64,
    #[serde(flatten)]
    pub command: AgentCommand,
}

fn clean(value: &str) -> Result<String> {
    let text: String = value
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_TEXT)
        .collect();
    let text = text.trim();
    if text.is_empty() {
        return Err("Agent command needs a non-empty value.".into());
    }
    Ok(text.to_owned())
}

// The CLI has no repository context, so bare names pass and the app resolves them.
fn branch_reference(value: &str) -> Result<String> {
    let name = clean(value)?;
    let name = name.as_str();
    if name.starts_with("refs/")
        && !(name.starts_with("refs/heads/") || name.starts_with("refs/remotes/"))
    {
        return Err("showDiff needs a local or remote branch reference.".into());
    }
    if name == "HEAD"
        || name.starts_with('-')
        || name.contains("@{")
        || name.contains("..")
        || name
            .chars()
            .any(|c| matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\') || c.is_whitespace())
    {
        return Err("showDiff needs a branch, not a revision expression.".into());
    }
    Ok(name.to_owned())
}

pub fn sanitize(command: AgentCommand) -> Result<AgentCommand> {
    Ok(match command {
        AgentCommand::ShowDiff { reference, working } => AgentCommand::ShowDiff {
            reference: branch_reference(&reference)?,
            working,
        },
        AgentCommand::OpenFile { path, line, column } => AgentCommand::OpenFile {
            path: clean(&path)?,
            // Editors count from one, so zero is a mistake rather than the first line.
            line: line.filter(|value| *value > 0),
            column: column.filter(|value| *value > 0),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(body: &str) -> Result<AgentCommand> {
        sanitize(serde_json::from_str(body).map_err(crate::error)?)
    }

    #[test]
    fn parses_and_sanitizes_supported_operations() {
        assert_eq!(
            parse(r#"{"op":"showDiff","reference":"refs/heads/main","working":true}"#).unwrap(),
            AgentCommand::ShowDiff {
                reference: "refs/heads/main".into(),
                working: true
            }
        );
        assert_eq!(
            parse(r#"{"op":"showDiff","reference":"main"}"#).unwrap(),
            AgentCommand::ShowDiff {
                reference: "main".into(),
                working: false
            }
        );
        assert_eq!(
            parse("{\"op\":\"openFile\",\"path\":\"src/a\\u0007b.ts\"}").unwrap(),
            AgentCommand::OpenFile {
                path: "src/ab.ts".into(),
                line: None,
                column: None
            }
        );
        assert_eq!(
            parse(r#"{"op":"openFile","path":" a.ts ","line":42,"column":7}"#).unwrap(),
            AgentCommand::OpenFile {
                path: "a.ts".into(),
                line: Some(42),
                column: Some(7)
            }
        );
        assert_eq!(
            parse(r#"{"op":"openFile","path":"a.ts","line":0}"#).unwrap(),
            AgentCommand::OpenFile {
                path: "a.ts".into(),
                line: None,
                column: None
            }
        );
        assert!(parse(r#"{"op":"openFile","path":"  "}"#).is_err());
        assert!(parse(r#"{"op":"gitCommit","message":"x"}"#).is_err());
        assert!(parse(r#"{"op":"showDiff"}"#).is_err());
    }

    #[test]
    fn show_diff_takes_branches_and_refuses_revision_expressions() {
        for reference in [
            "refs/heads/main",
            "refs/remotes/origin/main",
            "main",
            "origin/shared",
            "dima/feature/branch-name",
        ] {
            assert!(
                parse(&format!(r#"{{"op":"showDiff","reference":"{reference}"}}"#)).is_ok(),
                "{reference} should be accepted"
            );
        }
        for reference in [
            "HEAD",
            "HEAD~1",
            "main^",
            "main..dev",
            "main@{yesterday}",
            "refs/tags/v1",
            "-delete",
            "a branch",
            "src/*",
        ] {
            assert!(
                parse(&format!(r#"{{"op":"showDiff","reference":"{reference}"}}"#)).is_err(),
                "{reference} should be refused"
            );
        }
    }

    #[test]
    fn entries_keep_the_operation_flat_on_the_wire() {
        let entry = CommandEntry {
            sequence: 4,
            command: AgentCommand::OpenFile {
                path: "a.ts".into(),
                line: Some(2),
                column: None,
            },
        };
        let value = serde_json::to_value(&entry).unwrap();
        assert_eq!(value["op"], "openFile");
        assert_eq!(value["sequence"], 4);
        assert_eq!(value["line"], 2);
        assert!(value["column"].is_null());
    }
}
