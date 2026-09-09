use crate::{error, Result};
use std::path::Path;

#[cfg(unix)]
pub fn protect(path: &Path) -> Result<()> {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let metadata = std::fs::symlink_metadata(path).map_err(error)?;
    // SAFETY: geteuid has no arguments or memory preconditions.
    if metadata.uid() != unsafe { libc::geteuid() } || metadata.file_type().is_symlink() {
        return Err(
            "Session storage must be owned by the current user and cannot be a symlink.".into(),
        );
    }
    std::fs::set_permissions(
        path,
        std::fs::Permissions::from_mode(if metadata.is_dir() { 0o700 } else { 0o600 }),
    )
    .map_err(error)
}

#[cfg(windows)]
pub fn protect(path: &Path) -> Result<()> {
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, LocalFree},
        Security::{
            Authorization::{
                ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            },
            GetTokenInformation, SetFileSecurityW, TokenUser, DACL_SECURITY_INFORMATION,
            PROTECTED_DACL_SECURITY_INFORMATION, TOKEN_QUERY, TOKEN_USER,
        },
        System::Threading::{GetCurrentProcess, OpenProcessToken},
    };
    if std::fs::symlink_metadata(path)
        .map_err(error)?
        .file_type()
        .is_symlink()
    {
        return Err("Session storage cannot be a symbolic link.".into());
    }
    let failure = || error(std::io::Error::last_os_error());
    // SAFETY: Win32 handles and LocalAlloc buffers are released on every path;
    // the token buffer uses pointer-size alignment and the returned byte count.
    unsafe {
        let mut token = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(failure());
        }
        let mut length = 0;
        GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut length);
        let mut buffer = vec![0usize; (length as usize).div_ceil(std::mem::size_of::<usize>())];
        let success = GetTokenInformation(
            token,
            TokenUser,
            buffer.as_mut_ptr().cast(),
            length,
            &mut length,
        );
        CloseHandle(token);
        if success == 0 {
            return Err(failure());
        }
        let user = &*buffer.as_ptr().cast::<TOKEN_USER>();
        let mut sid = ptr::null_mut();
        if ConvertSidToStringSidW(user.User.Sid, &mut sid) == 0 {
            return Err(failure());
        }
        let mut size = 0;
        while *sid.add(size) != 0 {
            size += 1;
        }
        let identity = String::from_utf16_lossy(std::slice::from_raw_parts(sid, size));
        LocalFree(sid.cast());
        // A protected DACL permits only this user and SYSTEM. Child state files
        // inherit it; no Everyone or Users entry is retained from the parent.
        let sddl: Vec<u16> = format!("D:P(A;OICI;FA;;;{identity})(A;OICI;FA;;;SY)")
            .encode_utf16()
            .chain([0])
            .collect();
        let mut descriptor = ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            ptr::null_mut(),
        ) == 0
        {
            return Err(failure());
        }
        let name: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
        let result = SetFileSecurityW(
            name.as_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            descriptor,
        );
        let result = if result == 0 { Err(failure()) } else { Ok(()) };
        LocalFree(descriptor);
        result
    }
}
