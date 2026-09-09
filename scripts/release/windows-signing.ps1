$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'Certificate import is restricted to the disposable GitHub release runner.'
}
if (-not $env:WINDOWS_CERTIFICATE -or -not $env:WINDOWS_CERTIFICATE_PASSWORD) {
    throw 'Signed Windows builds require WINDOWS_CERTIFICATE and WINDOWS_CERTIFICATE_PASSWORD secrets.'
}
$certificateFile = Join-Path $env:RUNNER_TEMP ('emdeck-signing-' + [guid]::NewGuid() + '.pfx')
try {
    [IO.File]::WriteAllBytes($certificateFile, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))
    $password = ConvertTo-SecureString $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
    $certificates = Import-PfxCertificate -FilePath $certificateFile -CertStoreLocation Cert:\CurrentUser\My -Password $password
    $certificate = $certificates | Where-Object { $_.HasPrivateKey -and $_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3' } | Select-Object -First 1
    if (-not $certificate -or $certificate.NotAfter -lt (Get-Date)) { throw 'No valid code-signing certificate was imported.' }
    "EMDECK_CERT_THUMBPRINT=$($certificate.Thumbprint)" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
    New-Item -ItemType Directory -Path '.tmp' -Force | Out-Null
    $config = @{ bundle = @{ windows = @{ certificateThumbprint = $certificate.Thumbprint; digestAlgorithm = 'sha256'; timestampUrl = 'http://timestamp.digicert.com' } } }
    $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath '.tmp/windows-signing.json' -Encoding utf8
} finally {
    if (Test-Path -LiteralPath $certificateFile) { Remove-Item -LiteralPath $certificateFile -Force }
}
