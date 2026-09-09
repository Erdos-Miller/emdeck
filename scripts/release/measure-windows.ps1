param(
    [Parameter(Mandatory)][int]$AppProcessId,
    [ValidateRange(10, 14400)][int]$Seconds = 120,
    [string]$OutputPath = '.tmp/performance.json'
)
$ErrorActionPreference = 'Stop'
$rootProcess = Get-Process -Id $AppProcessId
if ($rootProcess.ProcessName -ne 'emdeck-ide') { throw 'Select an Emdeck process ID.' }
$startedAt = $rootProcess.StartTime
$samples = [Collections.Generic.List[object]]::new()
$previousCpu = @{}
$previousTime = Get-Date
$deadline = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $currentRoot = Get-Process -Id $AppProcessId -ErrorAction SilentlyContinue
    if (-not $currentRoot -or $currentRoot.StartTime -ne $startedAt) { throw 'Measured Emdeck instance exited.' }
    $all = Get-CimInstance Win32_Process
    $ids = [Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add($AppProcessId)
    do {
        $count = $ids.Count
        foreach ($entry in $all) { if ($ids.Contains([int]$entry.ParentProcessId)) { [void]$ids.Add([int]$entry.ProcessId) } }
    } while ($ids.Count -gt $count)
    $now = Get-Date
    $cpu = 0.0
    $workingSet = 0L
    $privateBytes = 0L
    $nextCpu = @{}
    foreach ($processId in $ids) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        $identity = "$processId/$($process.StartTime.Ticks)"
        $nextCpu[$identity] = $process.CPU
        # 0.0 selects the floating-point overload; integer 0 truncates short CPU deltas.
        if ($previousCpu.ContainsKey($identity)) { $cpu += [Math]::Max(0.0, $process.CPU - $previousCpu[$identity]) }
        $workingSet += $process.WorkingSet64
        $privateBytes += $process.PrivateMemorySize64
    }
    if ($previousCpu.Count -gt 0) {
        $samples.Add([pscustomobject]@{ utc = $now.ToUniversalTime().ToString('o'); processes = $ids.Count; cpuPercentOfOneCore = [Math]::Round(100 * $cpu / ($now - $previousTime).TotalSeconds, 2); workingSetMiB = [Math]::Round($workingSet / 1MB, 2); privateMiB = [Math]::Round($privateBytes / 1MB, 2) })
    }
    $previousCpu = $nextCpu
    $previousTime = $now
}
$outputFullPath = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($outputFullPath)) -Force | Out-Null
@{ durationSeconds = $Seconds; scope = 'Emdeck and currently attached descendants, including WebView2 and agent shells; working-set sums can double-count shared pages'; samples = @($samples.ToArray()) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outputFullPath
Write-Output "Performance samples saved to $OutputPath"
