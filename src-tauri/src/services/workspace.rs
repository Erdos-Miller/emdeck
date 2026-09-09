use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

pub type Result<T> = std::result::Result<T, String>;
pub const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024;
pub fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
}
#[derive(Serialize, Debug)]
pub struct Document {
    pub content: String,
    pub revision: String,
}

pub fn revision(bytes: &[u8]) -> String {
    let mut h = DefaultHasher::new();
    bytes.hash(&mut h);
    format!("{:x}", h.finish())
}

// Resolve every existing ancestor, including symlinks, before granting access.
pub fn resolve(root: &Path, relative: &str, write: bool) -> Result<PathBuf> {
    let rel = Path::new(relative);
    if rel
        .components()
        .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err("Use a path inside the open project.".into());
    }
    if write
        && (relative.is_empty()
            || rel
                .components()
                .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git")))
    {
        return Err("Project roots and Git metadata are protected.".into());
    }
    let candidate = root.join(rel);
    let resolved = if candidate.exists() {
        candidate.canonicalize().map_err(err)?
    } else {
        let parent = candidate
            .parent()
            .ok_or("Invalid parent")?
            .canonicalize()
            .map_err(err)?;
        parent.join(candidate.file_name().ok_or("Invalid file name")?)
    };
    if !resolved.starts_with(root) || (write && resolved == root) {
        return Err("Path is outside the open project.".into());
    }
    if write
        && resolved
            .strip_prefix(root)
            .map_err(err)?
            .components()
            .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git"))
    {
        return Err("Git metadata is protected.".into());
    }
    Ok(resolved)
}

pub fn list(root: &Path, relative: &str) -> Result<Vec<Entry>> {
    let directory = resolve(root, relative, false)?;
    let mut entries = vec![];
    for item in fs::read_dir(directory).map_err(err)? {
        let item = item.map_err(err)?;
        let name = item.file_name().to_string_lossy().into_owned();
        if name == ".git" {
            continue;
        }
        let ty = item.file_type().map_err(err)?;
        entries.push(Entry {
            path: if relative.is_empty() {
                name.clone()
            } else {
                format!("{relative}/{name}")
            },
            name,
            is_dir: item.path().is_dir(),
            is_symlink: ty.is_symlink(),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

pub(crate) fn read_bytes(path: &Path) -> Result<Vec<u8>> {
    let file = fs::File::open(path).map_err(err)?;
    if file.metadata().map_err(err)?.len() > MAX_FILE_SIZE {
        return Err(
            "This file exceeds the 5 MB editor limit. Open it with an external tool.".into(),
        );
    }
    let mut bytes = vec![];
    file.take(MAX_FILE_SIZE + 1)
        .read_to_end(&mut bytes)
        .map_err(err)?;
    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Err("File exceeds the 5 MB editor limit.".into());
    }
    Ok(bytes)
}

pub fn read(root: &Path, relative: &str) -> Result<Document> {
    let bytes = read_bytes(&resolve(root, relative, false)?)?;
    if bytes.contains(&0) {
        return Err("Binary files cannot be opened in the text editor.".into());
    }
    let hash = revision(&bytes);
    Ok(Document {
        content: String::from_utf8(bytes).map_err(|_| "This file is not UTF-8 text.")?,
        revision: hash,
    })
}

pub fn save(root: &Path, relative: &str, content: &str, expected: &str) -> Result<Document> {
    if content.len() as u64 > MAX_FILE_SIZE {
        return Err("File exceeds the 5 MB editor limit.".into());
    }
    let path = resolve(root, relative, true)?;
    let original = read_bytes(&path)?;
    if revision(&original) != expected {
        return Err("EXTERNAL_CHANGE: The file changed on disk. Reload it or save your edits to a new file before continuing.".into());
    }
    let permissions = fs::metadata(&path).map_err(err)?.permissions();
    let mut temp =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Invalid parent")?).map_err(err)?;
    temp.write_all(content.as_bytes()).map_err(err)?;
    temp.as_file().set_permissions(permissions).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    persist_document(temp, &path, expected)?;
    Ok(Document {
        content: content.into(),
        revision: revision(content.as_bytes()),
    })
}

fn persist_document(mut temp: tempfile::NamedTempFile, path: &Path, expected: &str) -> Result<()> {
    for attempt in 0..6 {
        // Revalidate after every wait: an agent may have edited the target meanwhile.
        if revision(&read_bytes(path)?) != expected {
            return Err(
                "EXTERNAL_CHANGE: The file changed while saving. Your edits are still in the editor."
                    .into(),
            );
        }
        match temp.persist(path) {
            Ok(_) => return Ok(()),
            Err(failure)
                if cfg!(windows)
                    && attempt < 5
                    && matches!(failure.error.raw_os_error(), Some(5 | 32 | 33)) =>
            {
                // Windows scanners/readers can briefly deny replacement. Keep the
                // original intact and retry the same atomic rename for at most 500 ms.
                temp = failure.file;
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(failure) => return Err(err(failure)),
        }
    }
    unreachable!("the final attempt returns its error")
}

pub fn create(root: &Path, relative: &str, directory: bool) -> Result<()> {
    let path = resolve(root, relative, true)?;
    if directory {
        fs::create_dir(path).map_err(err)
    } else {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map(|_| ())
            .map_err(err)
    }
}

pub fn rename(root: &Path, from: &str, to: &str) -> Result<()> {
    let src = resolve(root, from, true)?;
    let dst = resolve(root, to, true)?;
    if dst.exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    if fs::symlink_metadata(root.join(from))
        .map_err(err)?
        .file_type()
        .is_symlink()
    {
        return Err("Rename symbolic links using your system file manager.".into());
    }
    fs::rename(src, dst).map_err(err)
}

pub fn copy(root: &Path, from: &str, to: &str) -> Result<()> {
    let src = resolve(root, from, false)?;
    let dst = resolve(root, to, true)?;
    if dst.exists() || dst.starts_with(&src) {
        return Err("Choose a new destination outside the source folder.".into());
    }
    // Validate the complete copy before writing so a symlink cannot escape the root.
    fn validate(path: &Path) -> Result<()> {
        let meta = fs::symlink_metadata(path).map_err(err)?;
        if meta.file_type().is_symlink() {
            return Err(
                "Copying symbolic links is not supported. Use the system file manager.".into(),
            );
        }
        if meta.is_dir() {
            for item in fs::read_dir(path).map_err(err)? {
                let p = item.map_err(err)?.path();
                if p.file_name().is_some_and(|n| n == ".git") {
                    return Err("Copying Git metadata is not supported.".into());
                }
                validate(&p)?;
            }
        }
        Ok(())
    }
    fn perform(src: &Path, dst: &Path) -> Result<()> {
        if src.is_dir() {
            fs::create_dir(dst).map_err(err)?;
            for entry in fs::read_dir(src).map_err(err)? {
                let entry = entry.map_err(err)?;
                perform(&entry.path(), &dst.join(entry.file_name()))?;
            }
            Ok(())
        } else {
            fs::copy(src, dst).map(|_| ()).map_err(err)
        }
    }
    validate(&root.join(from))?;
    perform(&src, &dst)
}

pub fn remove(root: &Path, relative: &str) -> Result<()> {
    let path = resolve(root, relative, true)?;
    if fs::symlink_metadata(root.join(relative))
        .map_err(err)?
        .file_type()
        .is_symlink()
    {
        return Err("Remove symbolic links using your system file manager.".into());
    }
    trash::delete(path).map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn saves_after_a_temporary_windows_replacement_lock() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.join("locked.txt");
        fs::write(&path, "original").unwrap();
        let lock = fs::OpenOptions::new()
            .read(true)
            .share_mode(3)
            .open(&path)
            .unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            drop(lock);
        });
        save(&root, "locked.txt", "saved", &revision(b"original")).unwrap();
        release.join().unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "saved");
    }
    #[cfg(windows)]
    #[test]
    fn persistent_windows_lock_preserves_the_original() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.join("locked.txt");
        fs::write(&path, "original").unwrap();
        let lock = fs::OpenOptions::new()
            .read(true)
            .share_mode(3)
            .open(&path)
            .unwrap();
        assert!(save(&root, "locked.txt", "saved", &revision(b"original")).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        drop(lock);
        assert_eq!(fs::read_dir(root).unwrap().count(), 1);
    }
    #[cfg(windows)]
    #[test]
    fn retry_rejects_an_external_write_during_a_windows_lock() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.join("locked.txt");
        fs::write(&path, "original").unwrap();
        let mut lock = fs::OpenOptions::new()
            .write(true)
            .share_mode(3)
            .open(&path)
            .unwrap();
        let writer = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            lock.write_all(b"external").unwrap();
            lock.sync_all().unwrap();
        });
        let error = save(&root, "locked.txt", "saved", &revision(b"original")).unwrap_err();
        writer.join().unwrap();
        assert!(error.starts_with("EXTERNAL_CHANGE"), "{error}");
        assert_eq!(fs::read_to_string(path).unwrap(), "external");
    }
    #[test]
    fn files_preserve_content_and_reject_stale_writes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        create(&root, "hello.ts", false).unwrap();
        let doc = read(&root, "hello.ts").unwrap();
        let saved = save(&root, "hello.ts", "hello\r\n世界\r\n", &doc.revision).unwrap();
        assert_eq!(
            read(&root, "hello.ts").unwrap().content,
            "hello\r\n世界\r\n"
        );
        fs::write(root.join("hello.ts"), "agent edit").unwrap();
        assert!(save(&root, "hello.ts", "my edit", &saved.revision)
            .unwrap_err()
            .starts_with("EXTERNAL_CHANGE"));
        assert_eq!(read(&root, "hello.ts").unwrap().content, "agent edit");
    }
    #[test]
    fn protects_roots_traversal_git_and_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        for path in ["../outside", "", ".git/config", "a/../../outside"] {
            assert!(resolve(&root, path, true).is_err());
        }
        create(&root, "a", false).unwrap();
        assert!(create(&root, "a", false).is_err());
        create(&root, "b", false).unwrap();
        assert!(rename(&root, "a", "b").is_err());
        assert!(copy(&root, "a", "a").is_err());
    }
    #[test]
    fn directory_reads_are_shallow_and_sorted() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        create(&root, "z-dir", true).unwrap();
        create(&root, "a.txt", false).unwrap();
        create(&root, "z-dir/hidden", false).unwrap();
        let entries = list(&root, "").unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "z-dir");
    }
    #[test]
    fn rejects_binary_and_oversized_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("binary"), [0, 1, 2]).unwrap();
        assert!(read(&root, "binary").is_err());
        let f = fs::File::create(root.join("large")).unwrap();
        f.set_len(MAX_FILE_SIZE + 1).unwrap();
        assert!(read(&root, "large").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.join("escape")).unwrap();
        assert!(resolve(&root, "escape", false).is_err());
        assert!(resolve(&root, "escape/file", true).is_err());
    }
}
