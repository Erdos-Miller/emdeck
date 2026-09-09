use crate::services::workspace::{err, Result};
use serde::Serialize;
use std::{
    path::Path,
    process::{Command, Output},
};

pub fn command(root: &Path, args: &[&str]) -> Result<Output> {
    let mut cmd = Command::new("git");
    cmd.current_dir(root)
        .args(["--no-pager", "-c", "color.ui=false"])
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .env("GIT_EDITOR", "true")
        .env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.output()
        .map_err(|e| format!("Could not run Git. Install Git and add it to PATH. {e}"))
}
pub fn run(root: &Path, args: &[&str]) -> Result<String> {
    let output = command(root, args)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    pub original_path: Option<String>,
    pub index: String,
    pub working: String,
    pub conflict: bool,
}
#[derive(Serialize)]
pub struct Commit {
    pub hash: String,
    pub subject: String,
    pub age: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub available: bool,
    pub message: String,
    pub branch: String,
    pub local_branches: Vec<String>,
    pub remote_branches: Vec<String>,
    pub branch_details: Vec<crate::services::git_branches::Branch>,
    pub remotes: Vec<String>,
    pub operation: Option<String>,
    pub changes: Vec<Change>,
    pub commits: Vec<Commit>,
}

pub fn parse_status(raw: &[u8]) -> Vec<Change> {
    let mut result = vec![];
    let mut parts = raw.split(|b| *b == 0);
    while let Some(part) = parts.next() {
        if part.len() < 4 {
            continue;
        }
        let index = part[0] as char;
        let working = part[1] as char;
        let original = if index == 'R' || index == 'C' || working == 'R' || working == 'C' {
            parts
                .next()
                .map(|p| String::from_utf8_lossy(p).into_owned())
        } else {
            None
        };
        let conflict = matches!(
            (index, working),
            ('D', 'D')
                | ('A', 'U')
                | ('U', 'D')
                | ('U', 'A')
                | ('D', 'U')
                | ('A', 'A')
                | ('U', 'U')
        );
        result.push(Change {
            path: String::from_utf8_lossy(&part[3..]).into_owned(),
            original_path: original,
            index: index.to_string(),
            working: working.to_string(),
            conflict,
        });
    }
    result
}

pub fn snapshot(root: &Path) -> Result<Snapshot> {
    let top = run(root, &["rev-parse", "--show-toplevel"]);
    if let Err(message) = top {
        return Ok(Snapshot {
            available: false,
            message,
            branch: String::new(),
            local_branches: vec![],
            remote_branches: vec![],
            branch_details: vec![],
            remotes: vec![],
            operation: None,
            changes: vec![],
            commits: vec![],
        });
    }
    if Path::new(top.as_ref().unwrap().trim())
        .canonicalize()
        .map_err(err)?
        != root
    {
        return Ok(Snapshot {
            available: false,
            message: "Open the repository root to use Git tools.".into(),
            branch: String::new(),
            local_branches: vec![],
            remote_branches: vec![],
            branch_details: vec![],
            remotes: vec![],
            operation: None,
            changes: vec![],
            commits: vec![],
        });
    }
    let branch = run(root, &["symbolic-ref", "HEAD"])
        .or_else(|_| run(root, &["rev-parse", "--short", "HEAD"]))?
        .trim()
        .trim_start_matches("refs/heads/")
        .to_owned();
    let branch_details = crate::services::git_branches::branches(root)?;
    let local_branches = branch_details
        .iter()
        .filter(|b| b.reference.starts_with("refs/heads/"))
        .map(|b| b.name.clone())
        .collect();
    let remote_branches = branch_details
        .iter()
        .filter(|b| b.reference.starts_with("refs/remotes/"))
        .map(|b| b.name.clone())
        .collect();
    let status = command(
        root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
    )?;
    if !status.status.success() {
        return Err(String::from_utf8_lossy(&status.stderr).into_owned());
    }
    let commits = run(root, &["log", "-12", "--format=%h%x00%s%x00%cr"])
        .unwrap_or_default()
        .lines()
        .filter_map(|l| {
            let mut p = l.split('\0');
            Some(Commit {
                hash: p.next()?.into(),
                subject: p.next()?.into(),
                age: p.next()?.into(),
            })
        })
        .collect();
    Ok(Snapshot {
        available: true,
        message: String::new(),
        branch,
        local_branches,
        remote_branches,
        branch_details,
        remotes: run(root, &["remote"])?.lines().map(str::to_owned).collect(),
        operation: crate::services::git_branches::operation(root),
        changes: parse_status(&status.stdout),
        commits,
    })
}

pub fn action(root: &Path, action: &str, value: &str, original: Option<&str>) -> Result<String> {
    let _operation = crate::services::git_branches::acquire(root)?;
    match action {
        "switch" | "create" | "delete" | "merge" => {
            if value.starts_with('-') || value.is_empty() {
                return Err("Invalid branch name.".into());
            }
            let reference = format!("refs/heads/{value}");
            run(root, &["check-ref-format", &reference])?;
            match action {
                "switch" => run(root, &["switch", "--no-guess", value]),
                "create" => run(root, &["switch", "-c", value]),
                "delete" => run(root, &["branch", "-d", value]),
                _ => run(root, &["merge", "--no-edit", &reference]),
            }
        }
        "checkout-remote" | "merge-remote" => {
            let reference = format!("refs/remotes/{value}");
            if value.is_empty() || value.starts_with('-') {
                return Err("Invalid remote branch name.".into());
            }
            run(root, &["check-ref-format", &reference])?;
            run(root, &["show-ref", "--verify", &reference])?;
            if run(root, &["symbolic-ref", "-q", &reference]).is_ok() {
                return Err("Choose a remote branch, not a symbolic reference.".into());
            }
            if action == "checkout-remote" {
                // Git derives the local name from the configured remote refspec.
                // It refuses to overwrite an existing local branch.
                run(root, &["switch", "--track", &reference])
            } else {
                run(root, &["merge", "--no-edit", &reference])
            }
        }
        "stage" | "unstage" => {
            if value.is_empty()
                || Path::new(value)
                    .components()
                    .any(|c| !matches!(c, std::path::Component::Normal(_)))
            {
                return Err("Invalid Git file path.".into());
            }
            let mut args = if action == "stage" {
                vec!["add", "--", value]
            } else if run(root, &["rev-parse", "--verify", "HEAD"]).is_ok() {
                vec!["reset", "-q", "HEAD", "--", value]
            } else {
                vec!["rm", "--cached", "--", value]
            };
            if let Some(old) = original {
                if Path::new(old)
                    .components()
                    .any(|c| !matches!(c, std::path::Component::Normal(_)))
                {
                    return Err("Invalid original file path.".into());
                }
                args.push(old);
            }
            run(root, &args)
        }
        "commit" => {
            if value.trim().is_empty() {
                return Err("Write a commit message first.".into());
            }
            run(root, &["-c", "core.editor=true", "commit", "-m", value])
        }
        _ => Err("Unsupported Git action.".into()),
    }
}

pub fn diff(root: &Path, path: &str, staged: bool) -> Result<String> {
    let result = if staged {
        run(
            root,
            &[
                "diff",
                "--cached",
                "--no-ext-diff",
                "--no-textconv",
                "--",
                path,
            ],
        )?
    } else {
        run(
            root,
            &["diff", "--no-ext-diff", "--no-textconv", "--", path],
        )?
    };
    if result.len() > 2 * 1024 * 1024 {
        return Err("Diff exceeds the 2 MB viewer limit. Use Git in a terminal.".into());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_spaces_renames_and_conflicts() {
        let changes = parse_status(
            b" M a file.ts\0R  new name.ts\0old name.ts\0UU conflict.ts\0?? new.txt\0",
        );
        assert_eq!(changes.len(), 4);
        assert_eq!(changes[0].path, "a file.ts");
        assert_eq!(changes[1].original_path.as_deref(), Some("old name.ts"));
        assert!(changes[2].conflict);
    }
    #[test]
    fn local_and_remote_branches_stay_distinct_in_real_git() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        run(&root, &["init", "-b", "main"]).unwrap();
        run(&root, &["config", "user.name", "Emdeck Test"]).unwrap();
        run(&root, &["config", "user.email", "emdeck@example.test"]).unwrap();
        run(&root, &["config", "commit.gpgsign", "false"]).unwrap();
        run(&root, &["commit", "--allow-empty", "-m", "Initial"]).unwrap();
        let initial = run(&root, &["rev-parse", "HEAD"]).unwrap();
        run(&root, &["branch", "origin/shared"]).unwrap();
        run(&root, &["branch", "dima/feature/branch-name"]).unwrap();
        // Populate cached remote refs without network access or fetching.
        run(&root, &["remote", "add", "origin", "."]).unwrap();
        run(&root, &["remote", "add", "upstream", "."]).unwrap();
        run(&root, &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
        run(
            &root,
            &[
                "symbolic-ref",
                "refs/remotes/origin/HEAD",
                "refs/remotes/origin/main",
            ],
        )
        .unwrap();
        action(&root, "create", "remote-tip", None).unwrap();
        run(&root, &["commit", "--allow-empty", "-m", "Remote change"]).unwrap();
        let remote_tip = run(&root, &["rev-parse", "HEAD"]).unwrap();
        for reference in [
            "refs/remotes/origin/shared",
            "refs/remotes/origin/dima/bugfix/branch-name",
            "refs/remotes/upstream/main",
        ] {
            run(&root, &["update-ref", reference, "HEAD"]).unwrap();
        }
        action(&root, "switch", "main", None).unwrap();
        let state = snapshot(&root).unwrap();
        assert!(state.local_branches.contains(&"origin/shared".into()));
        assert!(state
            .local_branches
            .contains(&"dima/feature/branch-name".into()));
        assert_eq!(
            state.remote_branches,
            vec![
                "origin/dima/bugfix/branch-name",
                "origin/main",
                "origin/shared",
                "upstream/main"
            ]
        );
        let serialized = serde_json::to_value(state).unwrap();
        assert!(serialized["localBranches"].is_array());
        assert!(serialized["remoteBranches"].is_array());

        action(&root, "merge", "origin/shared", None).unwrap();
        assert_eq!(run(&root, &["rev-parse", "HEAD"]).unwrap(), initial);
        action(&root, "merge-remote", "origin/shared", None).unwrap();
        assert_eq!(run(&root, &["rev-parse", "HEAD"]).unwrap(), remote_tip);
        assert_eq!(
            run(&root, &["rev-parse", "refs/heads/origin/shared"]).unwrap(),
            initial
        );
        action(&root, "switch", "origin/shared", None).unwrap();
        assert_eq!(snapshot(&root).unwrap().branch, "origin/shared");
        // A local switch must not silently create a branch from a remote match.
        assert!(action(&root, "switch", "dima/bugfix/branch-name", None).is_err());
        action(
            &root,
            "checkout-remote",
            "origin/dima/bugfix/branch-name",
            None,
        )
        .unwrap();
        assert_eq!(snapshot(&root).unwrap().branch, "dima/bugfix/branch-name");
        assert_eq!(
            run(&root, &["rev-parse", "--symbolic-full-name", "@{upstream}"])
                .unwrap()
                .trim(),
            "refs/remotes/origin/dima/bugfix/branch-name"
        );
        action(&root, "switch", "main", None).unwrap();
        assert!(action(
            &root,
            "checkout-remote",
            "origin/dima/bugfix/branch-name",
            None
        )
        .is_err());
        assert_eq!(snapshot(&root).unwrap().branch, "main");
        assert!(action(&root, "checkout-remote", "origin/HEAD", None).is_err());
        assert!(action(&root, "checkout-remote", "origin/missing", None).is_err());
        assert!(action(&root, "merge-remote", "../heads/main", None).is_err());
        assert!(action(&root, "merge-remote", "--help", None).is_err());
    }
    #[test]
    fn git_workflow_on_real_repository() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        run(&root, &["init", "-b", "main"]).unwrap();
        run(&root, &["config", "user.name", "Emdeck Test"]).unwrap();
        run(&root, &["config", "user.email", "emdeck@example.test"]).unwrap();
        run(&root, &["config", "commit.gpgsign", "false"]).unwrap();
        std::fs::write(root.join("a file.txt"), "first\n").unwrap();
        assert_eq!(snapshot(&root).unwrap().changes[0].index, "?");
        action(&root, "stage", "a file.txt", None).unwrap();
        action(&root, "unstage", "a file.txt", None).unwrap();
        action(&root, "stage", "a file.txt", None).unwrap();
        action(&root, "commit", "Initial", None).unwrap();
        action(&root, "create", "feature", None).unwrap();
        assert_eq!(snapshot(&root).unwrap().branch, "feature");
        std::fs::write(root.join("a file.txt"), "feature\n").unwrap();
        assert!(diff(&root, "a file.txt", false)
            .unwrap()
            .contains("+feature"));
        action(&root, "stage", "a file.txt", None).unwrap();
        action(&root, "commit", "Feature", None).unwrap();
        action(&root, "switch", "main", None).unwrap();
        assert!(action(&root, "delete", "feature", None).is_err());
        std::fs::write(root.join("a file.txt"), "main\n").unwrap();
        action(&root, "stage", "a file.txt", None).unwrap();
        action(&root, "commit", "Main", None).unwrap();
        assert!(action(&root, "merge", "feature", None).is_err());
        assert!(snapshot(&root).unwrap().changes[0].conflict);
        std::fs::write(root.join("a file.txt"), "resolved\n").unwrap();
        action(&root, "stage", "a file.txt", None).unwrap();
        action(&root, "commit", "Resolve", None).unwrap();
        assert!(snapshot(&root).unwrap().changes.is_empty());
        action(&root, "delete", "feature", None).unwrap();
        assert!(action(&root, "switch", "--help", None).is_err());
    }
}
