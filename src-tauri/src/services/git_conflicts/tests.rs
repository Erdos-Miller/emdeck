use super::*;
use git::run;

fn commit(root: &Path, message: &str) {
    run(root, &["add", "--all"]).unwrap();
    run(root, &["commit", "-m", message]).unwrap();
}

fn repository(binary: bool, deleted: bool) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    run(&root, &["init", "-b", "main"]).unwrap();
    for (key, value) in [
        ("user.name", "Emdeck Test"),
        ("user.email", "emdeck@example.test"),
        ("commit.gpgsign", "false"),
        ("core.autocrlf", "false"),
        ("core.hooksPath", ".git/no-hooks"),
    ] {
        run(&root, &["config", key, value]).unwrap();
    }
    for path in ["a [1].txt", "other.txt"] {
        fs::write(
            root.join(path),
            if binary {
                b"base\0\n".as_slice()
            } else {
                b"base\n"
            },
        )
        .unwrap();
    }
    commit(&root, "Base");
    run(&root, &["checkout", "-b", "incoming"]).unwrap();
    for path in ["a [1].txt", "other.txt"] {
        fs::write(
            root.join(path),
            if binary {
                b"theirs\0\n".as_slice()
            } else {
                b"theirs\n"
            },
        )
        .unwrap();
    }
    commit(&root, "Incoming");
    run(&root, &["checkout", "main"]).unwrap();
    if deleted {
        fs::remove_file(root.join("a [1].txt")).unwrap();
    } else {
        fs::write(
            root.join("a [1].txt"),
            if binary {
                b"ours\0\n".as_slice()
            } else {
                b"ours\n"
            },
        )
        .unwrap();
    }
    fs::write(root.join("other.txt"), "ours\n").unwrap();
    commit(&root, "Ours");
    assert!(run(&root, &["merge", "--no-edit", "incoming"]).is_err());
    dir
}

fn request(conflict: &Conflict, choice: Choice, content: Option<&str>) -> Resolution {
    Resolution {
        path: conflict.path.clone(),
        revision: conflict.revision.clone(),
        choice,
        content: content.map(str::to_owned),
    }
}

#[test]
fn accepts_exact_sides_and_stages_only_the_selected_literal_path() {
    let dir = repository(false, false);
    let root = dir.path().canonicalize().unwrap();
    let head = run(&root, &["rev-parse", "HEAD"]).unwrap();
    let file = read(&root, "a [1].txt").unwrap();
    assert_eq!(file.base.content.as_deref(), Some("base\n"));
    assert_eq!(file.ours.content.as_deref(), Some("ours\n"));
    assert_eq!(file.theirs.content.as_deref(), Some("theirs\n"));
    assert!(file.working.content.as_ref().unwrap().contains("<<<<<<<"));
    resolve(&root, &request(&file, Choice::Theirs, None)).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("a [1].txt")).unwrap(),
        "theirs\n"
    );
    assert_eq!(run(&root, &["show", ":0:a [1].txt"]).unwrap(), "theirs\n");
    assert!(read(&root, "a [1].txt").is_err());
    let other = read(&root, "other.txt").unwrap();
    resolve(&root, &request(&other, Choice::Ours, None)).unwrap();
    assert!(run(&root, &["ls-files", "--unmerged"]).unwrap().is_empty());
    assert_eq!(run(&root, &["rev-parse", "HEAD"]).unwrap(), head);
    assert_eq!(git_branches::operation(&root).as_deref(), Some("merge"));
}

#[test]
fn saves_manual_results_with_crlf_and_allows_an_empty_result() {
    let dir = repository(false, false);
    let root = dir.path().canonicalize().unwrap();
    let file = read(&root, "a [1].txt").unwrap();
    resolve(
        &root,
        &request(&file, Choice::Manual, Some("combined\r\nresult\r\n")),
    )
    .unwrap();
    assert_eq!(
        fs::read(root.join("a [1].txt")).unwrap(),
        b"combined\r\nresult\r\n"
    );
    let other = read(&root, "other.txt").unwrap();
    resolve(&root, &request(&other, Choice::Manual, Some(""))).unwrap();
    assert_eq!(run(&root, &["show", ":0:other.txt"]).unwrap(), "");
}

#[test]
fn refuses_stale_disk_and_index_versions_without_losing_newer_edits() {
    let dir = repository(false, false);
    let root = dir.path().canonicalize().unwrap();
    let file = read(&root, "a [1].txt").unwrap();
    fs::write(root.join("a [1].txt"), "new agent edit\n").unwrap();
    assert!(resolve(&root, &request(&file, Choice::Theirs, None))
        .unwrap_err()
        .contains("EXTERNAL_CHANGE"));
    assert_eq!(
        fs::read_to_string(root.join("a [1].txt")).unwrap(),
        "new agent edit\n"
    );
    let file = read(&root, "a [1].txt").unwrap();
    run(&root, &["--literal-pathspecs", "add", "--", "a [1].txt"]).unwrap();
    assert!(resolve(&root, &request(&file, Choice::Ours, None)).is_err());
    assert_eq!(
        run(&root, &["show", ":0:a [1].txt"]).unwrap(),
        "new agent edit\n"
    );
}

#[test]
fn accepts_deleted_versions_and_can_restore_the_surviving_side() {
    for choice in [Choice::Ours, Choice::Theirs] {
        let dir = repository(false, true);
        let root = dir.path().canonicalize().unwrap();
        let file = read(&root, "a [1].txt").unwrap();
        assert!(!file.ours.exists);
        assert!(file.theirs.exists);
        let keep = matches!(choice, Choice::Theirs);
        resolve(&root, &request(&file, choice, None)).unwrap();
        assert_eq!(root.join("a [1].txt").exists(), keep);
        assert!(!run(&root, &["ls-files", "--unmerged"])
            .unwrap()
            .contains("a [1].txt"));
    }
}

#[test]
fn binary_conflicts_use_whole_versions_without_text_conversion() {
    let dir = repository(true, false);
    let root = dir.path().canonicalize().unwrap();
    let file = read(&root, "a [1].txt").unwrap();
    assert!(file.ours.binary);
    assert!(!file.manual_allowed);
    assert!(resolve(&root, &request(&file, Choice::Manual, Some("text"))).is_err());
    resolve(&root, &request(&file, Choice::Theirs, None)).unwrap();
    assert_eq!(fs::read(root.join("a [1].txt")).unwrap(), b"theirs\0\n");
}

#[test]
fn rejects_unsafe_paths_and_incomplete_conflict_markers() {
    let dir = repository(false, false);
    let root = dir.path().canonicalize().unwrap();
    for path in [
        "",
        "../outside",
        ".git/config",
        ":(glob)**",
        "other/../other.txt",
    ] {
        assert!(read(&root, path).is_err(), "{path}");
    }
    let file = read(&root, "a [1].txt").unwrap();
    for text in [
        "<<<<<<<\nunresolved",
        "========\n",
        "||||||||| base\n",
        ">>>>>>> branch\n",
    ] {
        assert!(resolve(&root, &request(&file, Choice::Manual, Some(text))).is_err());
    }
    assert_eq!(read(&root, "a [1].txt").unwrap().revision, file.revision);
}

#[test]
fn rebase_uses_git_stage_meaning_and_explains_the_swapped_roles() {
    let dir = repository(false, false);
    let root = dir.path().canonicalize().unwrap();
    run(&root, &["merge", "--abort"]).unwrap();
    run(&root, &["checkout", "incoming"]).unwrap();
    assert!(run(&root, &["rebase", "main"]).is_err());
    let file = read(&root, "a [1].txt").unwrap();
    assert!(file.ours_label.contains("destination"));
    assert!(file.theirs_label.contains("replayed"));
    assert_eq!(file.ours.content.as_deref(), Some("ours\n"));
    assert_eq!(file.theirs.content.as_deref(), Some("theirs\n"));
    resolve(&root, &request(&file, Choice::Theirs, None)).unwrap();
    assert_eq!(run(&root, &["show", ":0:a [1].txt"]).unwrap(), "theirs\n");
}
