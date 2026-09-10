use crate::services::{git, git_branches, workspace};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};
use workspace::{err, Result};

#[derive(Serialize, Debug)]
pub struct Version {
    pub exists: bool,
    pub content: Option<String>,
    pub binary: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub path: String,
    pub revision: String,
    pub base: Version,
    pub ours: Version,
    pub theirs: Version,
    pub working: Version,
    pub ours_label: String,
    pub theirs_label: String,
    pub manual_allowed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Choice {
    Ours,
    Theirs,
    Manual,
}

#[derive(Deserialize)]
pub struct Resolution {
    pub path: String,
    pub revision: String,
    pub choice: Choice,
    pub content: Option<String>,
}

struct IndexEntry {
    stage: usize,
    oid: String,
}

fn file_path(root: &Path, relative: &str) -> Result<PathBuf> {
    if relative.is_empty()
        || relative.contains('\0')
        || Path::new(relative)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("Invalid conflicted file path.".into());
    }
    let path = workspace::resolve(root, relative, true)?;
    // Do not follow in-project links either: resolution must affect this Git path only.
    let mut ancestor = root.to_path_buf();
    for part in Path::new(relative).components() {
        ancestor.push(part);
        if let Ok(metadata) = fs::symlink_metadata(&ancestor) {
            if metadata.file_type().is_symlink() {
                return Err("Resolve symbolic-link conflicts with Git in a terminal.".into());
            }
        }
    }
    if path.exists() && !path.is_file() {
        return Err("Resolve directory or submodule conflicts with Git in a terminal.".into());
    }
    Ok(path)
}

fn entries(root: &Path, path: &str) -> Result<(String, Vec<IndexEntry>)> {
    let raw = git::run(
        root,
        &[
            "--literal-pathspecs",
            "ls-files",
            "--unmerged",
            "-z",
            "--",
            path,
        ],
    )?;
    let mut entries = vec![];
    for record in raw.split('\0').filter(|record| !record.is_empty()) {
        let (header, name) = record
            .split_once('\t')
            .ok_or("Invalid unmerged index entry.")?;
        if name != path {
            return Err("Git returned a different conflict path.".into());
        }
        let fields: Vec<_> = header.split_whitespace().collect();
        if fields.len() != 3 || !["100644", "100755"].contains(&fields[0]) {
            return Err(
                "Resolve symbolic-link or submodule conflicts with Git in a terminal.".into(),
            );
        }
        let stage: usize = fields[2].parse().map_err(err)?;
        if !(1..=3).contains(&stage) {
            return Err("Invalid conflict stage.".into());
        }
        entries.push(IndexEntry {
            stage,
            oid: fields[1].into(),
        });
    }
    if entries.is_empty() {
        return Err("This file is no longer conflicted. Refresh the conflict list.".into());
    }
    Ok((raw, entries))
}

fn version(bytes: Option<Vec<u8>>) -> Version {
    let exists = bytes.is_some();
    let content = bytes.and_then(|bytes| {
        if bytes.contains(&0) {
            None
        } else {
            String::from_utf8(bytes).ok()
        }
    });
    Version {
        exists,
        binary: exists && content.is_none(),
        content,
    }
}

fn blob(root: &Path, entries: &[IndexEntry], stage: usize) -> Result<Version> {
    let Some(entry) = entries.iter().find(|entry| entry.stage == stage) else {
        return Ok(version(None));
    };
    let size: u64 = git::run(root, &["cat-file", "-s", &entry.oid])?
        .trim()
        .parse()
        .map_err(err)?;
    if size > workspace::MAX_FILE_SIZE {
        return Err(
            "This conflict exceeds the 5 MB merge editor limit. Resolve it with Git in a terminal."
                .into(),
        );
    }
    let output = git::command(root, &["cat-file", "blob", &entry.oid])?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(version(Some(output.stdout)))
}

fn working_bytes(path: &Path) -> Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Ok(_) => workspace::read_bytes(path).map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(err(error)),
    }
}

fn revision(root: &Path, index: &str, bytes: &Option<Vec<u8>>) -> Result<String> {
    let head = git::run(root, &["rev-parse", "HEAD"])?;
    let mut value = format!("{head}\0{index}\0{}\0", bytes.is_some()).into_bytes();
    if let Some(bytes) = bytes {
        value.extend(bytes);
    }
    Ok(workspace::revision(&value))
}

fn read_unlocked(root: &Path, relative: &str) -> Result<Conflict> {
    let path = file_path(root, relative)?;
    let (index, entries) = entries(root, relative)?;
    let bytes = working_bytes(&path)?;
    let revision = revision(root, &index, &bytes)?;
    let base = blob(root, &entries, 1)?;
    let ours = blob(root, &entries, 2)?;
    let theirs = blob(root, &entries, 3)?;
    let working = version(bytes);
    let rebasing = git_branches::operation(root).as_deref() == Some("rebase");
    let manual_allowed = ![&base, &ours, &theirs, &working]
        .iter()
        .any(|version| version.binary);
    Ok(Conflict {
        path: relative.into(),
        revision,
        base,
        ours,
        theirs,
        working,
        manual_allowed,
        ours_label: if rebasing {
            "Ours — rebased destination"
        } else {
            "Ours — current branch"
        }
        .into(),
        theirs_label: if rebasing {
            "Theirs — commit being replayed"
        } else {
            "Theirs — incoming changes"
        }
        .into(),
    })
}

pub fn read(root: &Path, relative: &str) -> Result<Conflict> {
    let _operation = git_branches::acquire(root)?;
    read_unlocked(root, relative)
}

fn has_markers(content: &str) -> bool {
    content.lines().any(|line| {
        let bytes = line.as_bytes();
        let Some(first) = bytes.first() else {
            return false;
        };
        if !b"<=>|".contains(first) {
            return false;
        }
        let count = bytes.iter().take_while(|byte| *byte == first).count();
        count >= 7 && (count == bytes.len() || matches!(bytes[count], b' ' | b'\t'))
    })
}

pub fn resolve(root: &Path, request: &Resolution) -> Result<()> {
    let _operation = git_branches::acquire(root)?;
    let current = read_unlocked(root, &request.path)?;
    if current.revision != request.revision {
        return Err("EXTERNAL_CHANGE: This conflict changed on disk or in Git. Reload it before resolving; your manual draft has been kept.".into());
    }
    let path = file_path(root, &request.path)?;
    match request.choice {
        Choice::Manual => {
            if !current.manual_allowed {
                return Err("Binary conflicts must accept one complete version.".into());
            }
            let content = request
                .content
                .as_deref()
                .ok_or("A merged result is required.")?;
            if has_markers(content) {
                return Err("Resolve all conflict markers before saving the result.".into());
            }
            if content.contains('\0') || content.len() as u64 > workspace::MAX_FILE_SIZE {
                return Err(
                    "The merge result must be UTF-8 text within the 5 MB editor limit.".into(),
                );
            }
            if current.working.exists {
                let expected = workspace::revision(
                    current
                        .working
                        .content
                        .as_ref()
                        .ok_or("Cannot edit binary data.")?
                        .as_bytes(),
                );
                workspace::save(root, &request.path, content, &expected)?;
            } else {
                use std::io::Write;
                let mut temp =
                    tempfile::NamedTempFile::new_in(path.parent().ok_or("Invalid parent.")?)
                        .map_err(err)?;
                temp.write_all(content.as_bytes()).map_err(err)?;
                temp.persist_noclobber(&path).map_err(err)?;
            }
        }
        Choice::Ours | Choice::Theirs => {
            let ours = matches!(request.choice, Choice::Ours);
            let chosen = if ours { &current.ours } else { &current.theirs };
            if chosen.exists {
                git::run(
                    root,
                    &[
                        "--literal-pathspecs",
                        "checkout",
                        if ours { "--ours" } else { "--theirs" },
                        "--",
                        &request.path,
                    ],
                )?;
            } else if current.working.exists {
                fs::remove_file(&path).map_err(err)?;
            }
        }
    }
    git::run(root, &["--literal-pathspecs", "add", "--", &request.path]).map_err(|error| {
        format!("The file was updated, but Git could not mark it resolved: {error}. Reload this conflict and retry; the result is still on disk.")
    })?;
    Ok(())
}

#[cfg(test)]
mod tests;
