#[cfg(windows)]
use crate::error;
use crate::Result;
use portable_pty::{Child, ChildKiller};

#[cfg(not(windows))]
pub fn killer(child: &dyn Child) -> Result<Box<dyn ChildKiller + Send + Sync>> {
    Ok(child.clone_killer())
}

#[cfg(windows)]
#[derive(Debug)]
struct WindowsKiller(std::os::windows::io::OwnedHandle);
#[cfg(windows)]
impl ChildKiller for WindowsKiller {
    fn kill(&mut self) -> std::io::Result<()> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::Threading::{GetExitCodeProcess, TerminateProcess};
        // SAFETY: the duplicated handle remains owned for the entire call.
        unsafe {
            let handle = self.0.as_raw_handle();
            let mut code = 0;
            if GetExitCodeProcess(handle, &mut code) != 0 && code != 259 {
                return Ok(());
            }
            if TerminateProcess(handle, 1) == 0 {
                return Err(std::io::Error::last_os_error());
            }
        }
        Ok(())
    }
    fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
        Box::new(Self(
            self.0
                .try_clone()
                .expect("Could not duplicate child handle"),
        ))
    }
}
#[cfg(windows)]
pub fn killer(child: &dyn Child) -> Result<Box<dyn ChildKiller + Send + Sync>> {
    use std::os::windows::io::FromRawHandle;
    use windows_sys::Win32::{
        Foundation::{DuplicateHandle, DUPLICATE_SAME_ACCESS},
        System::Threading::GetCurrentProcess,
    };
    let original = child
        .as_raw_handle()
        .ok_or("Child has no process handle.")?;
    let mut duplicate = std::ptr::null_mut();
    // SAFETY: source is borrowed from the live child; successful duplication
    // transfers ownership to OwnedHandle, which closes it on drop.
    unsafe {
        if DuplicateHandle(
            GetCurrentProcess(),
            original,
            GetCurrentProcess(),
            &mut duplicate,
            0,
            0,
            DUPLICATE_SAME_ACCESS,
        ) == 0
        {
            return Err(error(std::io::Error::last_os_error()));
        }
        Ok(Box::new(WindowsKiller(
            std::os::windows::io::OwnedHandle::from_raw_handle(duplicate),
        )))
    }
}

pub fn executable(name: &str) -> Result<std::path::PathBuf> {
    let path = std::path::Path::new(name);
    if path.is_absolute() && path.is_file() {
        return Ok(path.into());
    }
    let names = if cfg!(windows) && path.extension().is_none() {
        vec![format!("{name}.exe"), name.into()]
    } else {
        vec![name.into()]
    };
    std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).filter(|p| p.is_absolute()).flat_map(|p| names.iter().map(move |name| p.join(name))).find(|p| p.is_file()).ok_or_else(|| format!("Executable {name} was not found in PATH. Use its absolute path or configure the shell."))
}
