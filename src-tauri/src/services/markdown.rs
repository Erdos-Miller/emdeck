use crate::services::workspace::{self, err, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::Path;

pub fn image(root: &Path, relative: &str) -> Result<String> {
    let path = workspace::resolve(root, relative, false)?;
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        _ => return Err("This file is not a supported image.".into()),
    };
    let bytes = workspace::read_bytes(&path)?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

pub fn external_url(value: &str) -> Result<tauri::Url> {
    let url = tauri::Url::parse(value).map_err(err)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTP and HTTPS links can open in the browser.".into());
    }
    Ok(url)
}

pub fn open_external(value: &str) -> Result<()> {
    let url = external_url(value)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe")
            .arg(url.as_str())
            .creation_flags(0x08000000)
            .spawn()
            .map_err(err)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url.as_str())
            .spawn()
            .map_err(err)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url.as_str())
            .spawn()
            .map_err(err)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_project_images_and_rejects_escape_unsupported_and_oversized_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>";
        std::fs::write(root.join("image.svg"), svg).unwrap();
        assert_eq!(
            image(&root, "image.svg").unwrap(),
            format!("data:image/svg+xml;base64,{}", STANDARD.encode(svg))
        );
        assert!(image(&root, "../image.svg").is_err());
        std::fs::write(root.join("file.html"), "<script></script>").unwrap();
        assert!(image(&root, "file.html").is_err());
        let file = std::fs::File::create(root.join("large.png")).unwrap();
        file.set_len(workspace::MAX_FILE_SIZE + 1).unwrap();
        assert!(image(&root, "large.png").is_err());
    }
    #[test]
    fn external_links_accept_web_urls_only() {
        assert!(external_url("https://example.com/docs?q=hello#install").is_ok());
        for value in [
            "file:///C:/Windows",
            "javascript:alert(1)",
            "data:text/html,hello",
            "cmd:run",
            "https://user:secret@example.com",
            "//example.com",
        ] {
            assert!(external_url(value).is_err(), "{value}");
        }
    }
}
