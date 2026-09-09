use crate::services::workspace::{err, Result};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{atomic::AtomicU64, Mutex},
};
#[derive(Default)]
pub(crate) struct Projects {
    pub(crate) roots: Mutex<HashMap<String, HashSet<PathBuf>>>,
    pub(crate) active: Mutex<HashMap<String, PathBuf>>,
    pub(crate) initial: Mutex<HashMap<String, String>>,
    pub(crate) next_window: AtomicU64,
}
impl Projects {
    pub(crate) fn authorize(&self, window: &str, root: PathBuf) -> Result<()> {
        self.activate(window, &root)?;
        self.roots
            .lock()
            .map_err(err)?
            .entry(window.into())
            .or_default()
            .insert(root);
        Ok(())
    }
    pub(crate) fn activate(&self, window: &str, root: &Path) -> Result<()> {
        let mut active = self.active.lock().map_err(err)?;
        let root = root.canonicalize().map_err(err)?;
        if !root.is_dir() {
            return Err("Select a project folder.".into());
        }
        active.insert(window.into(), root);
        Ok(())
    }
    pub(crate) fn root(&self, window: &str, root: &str) -> Result<PathBuf> {
        let path = PathBuf::from(root).canonicalize().map_err(err)?;
        if !self
            .roots
            .lock()
            .map_err(err)?
            .get(window)
            .is_some_and(|roots| roots.contains(&path))
        {
            return Err("Open this project before accessing it.".into());
        }
        Ok(path)
    }
    pub(crate) fn forget(&self, window: &str) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(window);
        }
        if let Ok(mut roots) = self.roots.lock() {
            roots.remove(window);
        }
        if let Ok(mut initial) = self.initial.lock() {
            initial.remove(window);
        }
    }
}
#[cfg(test)]
mod window_tests {
    use super::*;
    #[test]
    fn project_access_and_cleanup_are_scoped_to_the_opening_window() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let a = first.path().canonicalize().unwrap();
        let b = second.path().canonicalize().unwrap();
        let projects = Projects::default();
        projects.authorize("main", a.clone()).unwrap();
        projects.authorize("workspace-1", b.clone()).unwrap();
        assert!(projects.root("main", &a.to_string_lossy()).is_ok());
        assert!(projects.root("main", &b.to_string_lossy()).is_err());
        assert!(projects.root("workspace-1", &a.to_string_lossy()).is_err());
        assert_eq!(projects.active.lock().unwrap().get("main"), Some(&a));
        projects.authorize("main", b.clone()).unwrap();
        assert_eq!(projects.active.lock().unwrap().get("main"), Some(&b));
        projects.forget("main");
        assert!(!projects.active.lock().unwrap().contains_key("main"));
        assert!(projects.root("main", &a.to_string_lossy()).is_err());
        assert!(projects.root("workspace-1", &b.to_string_lossy()).is_ok());
    }
}
