use crate::services::{
    git::run,
    workspace::{err, Result},
};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub branch: String,
    pub head: String,
    pub main: bool,
    pub bare: bool,
    pub current: bool,
    pub open: bool,
    pub missing: bool,
    pub locked: Option<String>,
    pub prunable: Option<String>,
}

fn parse(raw: &str) -> Vec<Worktree> {
    let mut result = vec![];
    let mut item: Option<Worktree> = None;
    for field in raw.split('\0') {
        let (label, value) = field.split_once(' ').unwrap_or((field, ""));
        if label == "worktree" {
            if let Some(previous) = item.take() {
                result.push(previous);
            }
            item = Some(Worktree {
                path: value.into(),
                ..Worktree::default()
            });
        } else if let Some(item) = item.as_mut() {
            match label {
                "HEAD" => item.head = value.into(),
                "branch" => item.branch = value.trim_start_matches("refs/heads/").into(),
                "bare" => item.bare = true,
                "locked" => item.locked = Some(value.into()),
                "prunable" => item.prunable = Some(value.into()),
                _ => {}
            }
        }
    }
    if let Some(item) = item {
        result.push(item);
    }
    if let Some(first) = result.first_mut() {
        first.main = true;
    }
    result
}

pub fn list(root: &Path, open_roots: &[PathBuf]) -> Result<Vec<Worktree>> {
    let raw = crate::services::git::command(root, &["worktree", "list", "--porcelain", "-z"])?;
    if !raw.status.success() {
        return Err(String::from_utf8_lossy(&raw.stderr).trim().into());
    }
    // Never turn a non-UTF-8 path into a different path for a subsequent removal.
    let mut items = parse(std::str::from_utf8(&raw.stdout).map_err(err)?);
    for item in &mut items {
        if let Ok(path) = Path::new(&item.path).canonicalize() {
            item.current = path == root;
            item.open = open_roots.iter().any(|p| p.starts_with(&path));
        } else {
            item.missing = true;
        }
    }
    Ok(items)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktree {
    pub path: String,
    pub branch: String,
    pub new_branch: bool,
    pub start_point: String,
}

fn git_path(path: &Path) -> Result<String> {
    let value = path.to_str().ok_or("Worktree paths must be valid UTF-8.")?;
    // Rust canonical paths use the Win32 verbatim prefix. Git for Windows
    // cannot create worktrees using that prefix in a command-line argument.
    #[cfg(windows)]
    {
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return Ok(format!(r"\\{unc}"));
        }
        if let Some(drive) = value.strip_prefix(r"\\?\") {
            return Ok(drive.into());
        }
    }
    Ok(value.into())
}

pub fn create(root: &Path, request: &CreateWorktree) -> Result<String> {
    let _operation = crate::services::git_branches::acquire(root)?;
    let path = Path::new(&request.path);
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err("Choose an absolute destination without '.' or '..'.".into());
    }
    let parent = path
        .parent()
        .ok_or("Choose a destination folder.")?
        .canonicalize()
        .map_err(err)?;
    if !parent.is_dir() {
        return Err("The destination's parent must be an existing folder.".into());
    }
    let target = parent.join(path.file_name().ok_or("Choose a new folder name.")?);
    if target.symlink_metadata().is_ok() {
        return Err("The destination already exists. Choose a new folder name.".into());
    }
    for item in list(root, &[])? {
        if let Ok(existing) = Path::new(&item.path).canonicalize() {
            if target.starts_with(&existing) || existing.starts_with(&target) {
                return Err("Create the worktree outside existing worktree folders.".into());
            }
        }
    }
    let branch = &request.branch;
    if branch.is_empty() || branch.starts_with('-') {
        return Err("Enter a valid branch name.".into());
    }
    let reference = format!("refs/heads/{branch}");
    run(root, &["check-ref-format", &reference])?;
    let destination = git_path(&target)?;
    if request.new_branch {
        let start = request.start_point.as_str();
        if start != "HEAD" {
            if !(start.starts_with("refs/heads/") || start.starts_with("refs/remotes/")) {
                return Err("Choose a local or remote starting branch.".into());
            }
            run(root, &["check-ref-format", start])?;
            run(root, &["show-ref", "--verify", start])?;
        }
        // Prevent an unborn HEAD from silently creating an orphan worktree.
        run(
            root,
            &["rev-parse", "--verify", &format!("{start}^{{commit}}")],
        )?;
        run(
            root,
            &["worktree", "add", "-b", branch, "--", &destination, start],
        )?;
    } else {
        run(root, &["show-ref", "--verify", &reference])?;
        // A full ref as the final argument would detach HEAD. A validated local
        // branch plus --no-guess-remote preserves both attachment and namespace.
        run(
            root,
            &[
                "worktree",
                "add",
                "--no-guess-remote",
                "--",
                &destination,
                branch,
            ],
        )?;
    }
    Ok(destination)
}

pub fn remove(root: &Path, requested: &str, open_roots: &[PathBuf]) -> Result<()> {
    let _operation = crate::services::git_branches::acquire(root)?;
    let path = Path::new(requested);
    if !path.is_absolute()
        || path
            .symlink_metadata()
            .map_err(err)?
            .file_type()
            .is_symlink()
    {
        return Err("Choose a registered worktree folder, not a symbolic link.".into());
    }
    let target = path.canonicalize().map_err(err)?;
    let item = list(root, open_roots)?
        .into_iter()
        .find(|item| {
            Path::new(&item.path)
                .canonicalize()
                .is_ok_and(|p| p == target)
        })
        .ok_or("This folder is not a registered worktree in this repository.")?;
    if item.main || item.bare || item.current || target == root || target.parent().is_none() {
        return Err("The main or current worktree cannot be removed.".into());
    }
    if item.open {
        return Err("Close this worktree's Emdeck window before removing it.".into());
    }
    if item.locked.is_some() {
        return Err("This worktree is locked. Unlock it in Git before removing it.".into());
    }
    // Confirm both the final absolute folder and its repository identity before
    // Git recursively removes anything. Never use force or filesystem deletion.
    let top = run(&target, &["rev-parse", "--show-toplevel"])?;
    let common = |dir: &Path| -> Result<PathBuf> {
        let value = run(dir, &["rev-parse", "--git-common-dir"])?;
        dir.join(value.trim()).canonicalize().map_err(err)
    };
    if Path::new(top.trim()).canonicalize().map_err(err)? != target
        || common(root)? != common(&target)?
    {
        return Err(
            "The worktree folder no longer belongs to this repository. Refresh and try again."
                .into(),
        );
    }
    run(root, &["worktree", "remove", "--", &git_path(&target)?])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn repo() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("main project");
        std::fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap();
        run(&root, &["init", "-b", "main"]).unwrap();
        run(&root, &["config", "user.name", "Emdeck Test"]).unwrap();
        run(&root, &["config", "user.email", "emdeck@example.test"]).unwrap();
        run(&root, &["config", "commit.gpgsign", "false"]).unwrap();
        run(&root, &["config", "core.autocrlf", "false"]).unwrap();
        std::fs::write(root.join("file.txt"), "initial\n").unwrap();
        run(&root, &["add", "file.txt"]).unwrap();
        run(&root, &["commit", "-m", "Initial"]).unwrap();
        (dir, root)
    }
    fn request(dir: &Path, name: &str, branch: &str, new_branch: bool) -> CreateWorktree {
        CreateWorktree {
            path: dir.join(name).to_string_lossy().into(),
            branch: branch.into(),
            new_branch,
            start_point: "HEAD".into(),
        }
    }
    #[test]
    fn parses_nul_delimited_paths_and_optional_reasons() {
        let items = parse("worktree /main\0bare\0\0worktree /a\nquoted \"name\"\0HEAD abc\0branch refs/heads/dima/fix\0locked\0\0worktree /missing\0detached\0prunable disk missing\0\0");
        assert_eq!(items.len(), 3);
        assert!(items[0].main && items[0].bare);
        assert_eq!(items[1].path, "/a\nquoted \"name\"");
        assert_eq!(items[1].branch, "dima/fix");
        assert_eq!(items[1].locked.as_deref(), Some(""));
        assert_eq!(items[2].prunable.as_deref(), Some("disk missing"));
    }
    #[test]
    fn creates_isolated_branches_and_removes_without_deleting_branch() {
        let (dir, root) = repo();
        std::fs::write(root.join("file.txt"), "unsaved on disk\n").unwrap();
        let new = request(dir.path(), "agent space", "dima/agent/fix", true);
        let added = create(&root, &new).unwrap();
        let linked = Path::new(&added).canonicalize().unwrap();
        assert_eq!(
            std::fs::read_to_string(linked.join("file.txt")).unwrap(),
            "initial\n"
        );
        assert_eq!(
            std::fs::read_to_string(root.join("file.txt")).unwrap(),
            "unsaved on disk\n"
        );
        assert_eq!(
            crate::services::git::snapshot(&linked).unwrap().branch,
            "dima/agent/fix"
        );
        let items = list(&linked, std::slice::from_ref(&linked)).unwrap();
        assert!(items[0].main && !items[0].current);
        assert!(items[1].current && items[1].open);
        remove(&root, &added, &[]).unwrap();
        assert!(!linked.exists());
        assert_eq!(list(&root, &[]).unwrap().len(), 1);
        run(
            &root,
            &["show-ref", "--verify", "refs/heads/dima/agent/fix"],
        )
        .unwrap();
        let existing = request(dir.path(), "reopened", "dima/agent/fix", false);
        let reopened = create(&root, &existing).unwrap();
        assert_eq!(
            run(Path::new(&reopened), &["symbolic-ref", "HEAD"])
                .unwrap()
                .trim(),
            "refs/heads/dima/agent/fix"
        );
        assert!(create(
            &root,
            &request(dir.path(), "duplicate", "dima/agent/fix", false)
        )
        .is_err());
        assert!(!dir.path().join("duplicate").exists());
    }
    #[test]
    fn remote_start_creates_tracking_branch_and_preserves_current_checkout() {
        let (dir, root) = repo();
        run(&root, &["remote", "add", "origin", "."]).unwrap();
        run(&root, &["update-ref", "refs/remotes/origin/topic", "HEAD"]).unwrap();
        let mut new = request(dir.path(), "remote agent", "agent/topic", true);
        new.start_point = "refs/remotes/origin/topic".into();
        let path = create(&root, &new).unwrap();
        assert_eq!(
            run(
                Path::new(&path),
                &["rev-parse", "--symbolic-full-name", "@{upstream}"]
            )
            .unwrap()
            .trim(),
            "refs/remotes/origin/topic"
        );
        assert_eq!(
            crate::services::git::snapshot(&root).unwrap().branch,
            "main"
        );
    }
    #[test]
    fn refuses_dirty_locked_open_main_current_and_unrelated_removals() {
        let (dir, root) = repo();
        let added = create(&root, &request(dir.path(), "agent", "agent", true)).unwrap();
        let target = Path::new(&added).canonicalize().unwrap();
        assert!(remove(&target, &added, &[]).is_err());
        assert!(remove(&root, root.to_str().unwrap(), &[]).is_err());
        assert!(remove(&root, dir.path().to_str().unwrap(), &[]).is_err());
        assert!(remove(&root, &added, std::slice::from_ref(&target))
            .unwrap_err()
            .contains("Close"));
        std::fs::create_dir(target.join("nested")).unwrap();
        assert!(remove(&root, &added, &[target.join("nested")])
            .unwrap_err()
            .contains("Close"));
        std::fs::write(target.join("file.txt"), "changed").unwrap();
        assert!(remove(&root, &added, &[]).is_err());
        assert_eq!(
            std::fs::read_to_string(target.join("file.txt")).unwrap(),
            "changed"
        );
        run(&target, &["restore", "file.txt"]).unwrap();
        std::fs::write(target.join("untracked.txt"), "keep").unwrap();
        assert!(remove(&root, &added, &[]).is_err());
        assert!(target.join("untracked.txt").exists());
        std::fs::remove_file(target.join("untracked.txt")).unwrap();
        run(
            &root,
            &["worktree", "lock", "--reason", "agent running", &added],
        )
        .unwrap();
        assert_eq!(
            list(&root, &[]).unwrap()[1].locked.as_deref(),
            Some("agent running")
        );
        assert!(remove(&root, &added, &[]).unwrap_err().contains("locked"));
        run(&root, &["worktree", "unlock", &added]).unwrap();
        remove(&root, &added, &[]).unwrap();
    }
    #[test]
    fn rejects_unsafe_or_existing_destinations_and_invalid_branches() {
        let (dir, root) = repo();
        for path in [
            root.clone(),
            root.join("nested"),
            dir.path().join("missing/child"),
            PathBuf::from("relative"),
        ] {
            let mut new = request(dir.path(), "unused", "new", true);
            new.path = path.to_string_lossy().into();
            assert!(create(&root, &new).is_err());
        }
        for branch in ["--force", "../bad", "", "main"] {
            assert!(create(&root, &request(dir.path(), "unused", branch, true)).is_err());
        }
        let mut new = request(dir.path(), "unused", "new", true);
        new.start_point = "--help".into();
        assert!(create(&root, &new).is_err());
        assert!(!dir.path().join("unused").exists());
        assert!(root.join("file.txt").exists());
    }
}
