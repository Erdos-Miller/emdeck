# Installing Emdeck

Download builds from the project's
[GitHub Releases](https://github.com/Erdos-Miller/emdeck/releases) page. Until a
release is published, build from source using the README. Match the version,
operating system and processor in the asset name.

| Platform            | Asset                              | Requirements                                                            |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Windows x64         | `Emdeck-<version>-windows-x64.exe` | Windows 10/11, WebView2 runtime                                         |
| macOS Apple Silicon | `Emdeck-<version>-macos-arm64.dmg` | A supported macOS version; see release notes                            |
| macOS Intel         | `Emdeck-<version>-macos-x64.dmg`   | A supported macOS version; see release notes                            |
| Linux x64           | `.deb` or `.AppImage`              | Initially targeted at Ubuntu 24.04; WebKitGTK 4.1/platform dependencies |

Run the Windows installer. On macOS, open the DMG and drag Emdeck to
Applications. On Ubuntu, install the downloaded `.deb` with
`sudo apt install ./Emdeck-<version>-linux-x64.deb`, substituting the actual
filename. AppImage builds must be made executable and may need FUSE support.
Other Linux distributions are not automatically certified by a successful Ubuntu
build.

Release notes state whether the downloads are signed. Unsigned beta builds can
show Windows/macOS warnings or be blocked by device policy. Do not disable
operating-system security globally; use a signed release or follow your
organization's approved development-build process.

## Verify a download

Each release supplies `SHA256SUMS.txt`. Compare the downloaded file's SHA-256
with its line in that file:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Emdeck-<version>-windows-x64.exe
```

On macOS use `shasum -a 256 <filename>`; on Linux use `sha256sum <filename>`. A
checksum detects a mismatched/corrupted download; it does not substitute for
code signing or an independently trusted release source.

## First launch and updates

Install Git and the agent CLIs you want to use separately. Authenticate through
each CLI before launching it from Emdeck. These tools run with your local user
permissions. Emdeck has no subscription or bundled AI credentials.

Open a trusted project folder, edit files, and launch terminals explicitly. Your
last project and layout are restored by default. Turn off restoration in
Settings if you prefer an empty workspace.

There is no automatic updater yet. Save your work, close Emdeck, and install the
new version. Preferences use the stable `dev.relay.ide` profile. When removing
an older Relay/Veldri/Emdeck installation, keep app data if you want those
preferences preserved. Terminal sessions and unsaved editor buffers are not
restored after a crash.

## Uninstall

Use Windows Installed Apps, remove Emdeck from macOS Applications, or use the
Linux package manager. For AppImage, remove the downloaded executable.
Uninstalling may retain local settings and recent paths; consult
[Privacy](PRIVACY.md) before removing profile data manually.
