param(
    [ValidateSet('Configure', 'Remove')][string]$Mode,
    [string]$Profile,
    [ValidateRange(1024, 65535)][int]$Port = 9222
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'WebView test policies are restricted to disposable GitHub runners.'
}
# WebView2 150+ ignores environment overrides in elevated host processes.
# GitHub Windows runners are elevated. Scope policy to this executable only;
# never use the wildcard that would expose other applications to debugging.
# https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645
$base = 'HKLM:\Software\Policies\Microsoft\Edge\WebView2'
$name = 'emdeck-ide.exe'
$values = @{
    AdditionalBrowserArguments = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$Port"
    UserDataFolder = $Profile
}
if ($Mode -eq 'Remove') {
    foreach ($key in $values.Keys) {
        Remove-ItemProperty -LiteralPath "$base\$key" -Name $name -ErrorAction SilentlyContinue
    }
    exit
}
if (-not [System.IO.Path]::IsPathFullyQualified($Profile)) { throw 'An absolute isolated profile is required.' }
foreach ($key in $values.Keys) {
    if (Get-ItemProperty -LiteralPath "$base\$key" -Name $name -ErrorAction SilentlyContinue) {
        throw 'Refusing to replace an existing Emdeck WebView policy.'
    }
}
$created = @()
try {
    foreach ($key in $values.Keys) {
        New-Item -Path "$base\$key" -Force | Out-Null
        New-ItemProperty -LiteralPath "$base\$key" -Name $name -Value $values[$key] -PropertyType String | Out-Null
        $created += $key
    }
} catch {
    foreach ($key in $created) {
        Remove-ItemProperty -LiteralPath "$base\$key" -Name $name -ErrorAction SilentlyContinue
    }
    throw
}
Write-Output 'Configured isolated WebView testing policy for Emdeck on this disposable runner.'
