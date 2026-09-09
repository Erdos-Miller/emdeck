param([ValidateSet('x86_64-pc-windows-msvc')][string]$Target = 'x86_64-pc-windows-msvc')
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'Installer checks run only in a disposable GitHub runner, never against a developer installation.'
}
if (Get-Process -Name 'emdeck-ide' -ErrorAction SilentlyContinue) { throw 'An Emdeck process is already running.' }
$version = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
$installer = Get-ChildItem -LiteralPath "src-tauri/target/$Target/release/bundle/nsis" -Filter "*${version}*setup.exe"
if (@($installer).Count -ne 1) { throw 'Expected one installer for the current version.' }
$testRoot = Join-Path $env:RUNNER_TEMP ('emdeck-install-' + [guid]::NewGuid())
$installPath = Join-Path $testRoot 'app'
$executable = Join-Path $installPath 'emdeck-ide.exe'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$startedApp = $null
function Invoke-Installer {
    $installProcess = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$installPath") -WindowStyle Hidden -PassThru
    if (-not $installProcess.WaitForExit(120000)) { $installProcess.Kill(); throw 'Installer timed out.' }
    if ($installProcess.ExitCode -ne 0) { throw "Installer failed with code $($installProcess.ExitCode)." }
}
try {
    Invoke-Installer
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable missing.' }
    if ((Get-Item -LiteralPath $executable).VersionInfo.ProductVersion -ne $version) { throw 'Installed version mismatch.' }
    foreach ($notice in @('LICENSE', 'THIRD_PARTY_NOTICES.md', 'JAVASCRIPT.md', 'RUST.md')) {
        if (-not (Test-Path -LiteralPath (Join-Path $installPath "licenses/$notice"))) { throw "Missing bundled notice: $notice" }
    }
    if ($env:EMDECK_SIGNED -eq 'true') {
        foreach ($signedFile in @($installer.FullName, $executable)) {
            if ((Get-AuthenticodeSignature -LiteralPath $signedFile).Status -ne 'Valid') { throw 'Invalid release signature.' }
        }
    }
    $startedApp = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $startedApp.Refresh()
        if ($startedApp.HasExited) { throw 'Installed application exited before opening a window.' }
    } while ($startedApp.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline)
    if ($startedApp.MainWindowHandle -eq 0 -or -not $startedApp.Responding) { throw 'Installed application did not open a responsive window.' }
    ./scripts/release/measure-windows.ps1 -AppProcessId $startedApp.Id -Seconds 30 -OutputPath '.tmp/install-performance.json'
    if (-not $startedApp.CloseMainWindow() -or -not $startedApp.WaitForExit(20000)) { throw 'Application did not close gracefully.' }
    $profile = Join-Path $env:LOCALAPPDATA 'dev.relay.ide'
    New-Item -ItemType Directory -Path $profile -Force | Out-Null
    $sentinel = Join-Path $profile 'emdeck-upgrade-smoke.txt'
    'preserve application data' | Set-Content -LiteralPath $sentinel
    Invoke-Installer
    if (-not (Test-Path -LiteralPath $sentinel)) { throw 'Reinstall removed application data.' }
    $uninstaller = Join-Path $installPath 'uninstall.exe'
    $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru
    if (-not $uninstallProcess.WaitForExit(60000)) { $uninstallProcess.Kill(); throw 'Uninstall timed out.' }
    $deadline = (Get-Date).AddSeconds(30)
    while ((Test-Path -LiteralPath $executable) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (Test-Path -LiteralPath $executable) { throw 'Uninstall left the application executable.' }
    if (-not (Test-Path -LiteralPath $sentinel)) { throw 'Uninstall unexpectedly removed retained app data.' }
    Write-Output 'Install, native launch, graceful close, same-version reinstall/data preservation, and uninstall passed.'
} finally {
    if ($startedApp -and -not $startedApp.HasExited) { $startedApp.Kill() }
    # Runner files and retained profile data are intentionally left for diagnostics.
}
