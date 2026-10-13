#requires -Version 5.1
param([switch]$AutoStart)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Windows
$mutex = New-Object Threading.Mutex($false, ('Local\ObsidianTunnel-' + $script:UserSid))
$ownsMutex = $false
$child = $null
$failed = $false
try {
    try { $ownsMutex = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { exit 0 }
    if ($AutoStart) { Remove-Item -LiteralPath $script:StopPath -Force -ErrorAction SilentlyContinue }
    $config = Read-Config
    if (-not (Test-Path -LiteralPath $config.ClientExe)) { throw '找不到 tunnel-client.exe，请重新运行安装程序。' }
    Write-RuntimeLog '后台守护程序启动。'
    while (-not (Test-Path -LiteralPath $script:StopPath)) {
        $keys = Read-Keys
        $script:Redactions = @($keys.ControlPlane, $keys.Obsidian)
        Start-Companions $config
        if (-not (Test-Obsidian $config.McpUrl $keys.Obsidian)) {
            Write-State 'WaitingForObsidian'
            Write-RuntimeLog '等待 Obsidian：请打开正确的库，并确认 HTTP 27123 和插件密钥有效。15 秒后重试。'
            if (-not (Wait-Retry 15)) { break }
            continue
        }
        if (-not (Test-ProxyPort $config.ProxyUrl)) {
            Write-State 'WaitingForClash'
            Write-RuntimeLog '等待 Clash 代理端口 7897。15 秒后重试。'
            if (-not (Wait-Retry 15)) { break }
            continue
        }
        $processInfo = New-Object Diagnostics.ProcessStartInfo
        $processInfo.FileName = $config.ClientExe
        $processInfo.WorkingDirectory = Split-Path -Parent $config.ClientExe
        $processInfo.Arguments = 'run --profile obsidian --health.listen-addr 127.0.0.1:8080 --control-plane.http-proxy http://127.0.0.1:7897'
        $processInfo.UseShellExecute = $false
        $processInfo.CreateNoWindow = $true
        $processInfo.RedirectStandardOutput = $true
        $processInfo.RedirectStandardError = $true
        $processInfo.EnvironmentVariables['CONTROL_PLANE_API_KEY'] = $keys.ControlPlane
        $processInfo.EnvironmentVariables['OBSIDIAN_AUTH'] = 'Bearer ' + $keys.Obsidian
        $processInfo.EnvironmentVariables['MCP_EXTRA_HEADERS'] = 'Authorization: env:OBSIDIAN_AUTH'
        $processInfo.EnvironmentVariables['MCP_DISCOVERY_EXTRA_HEADERS'] = 'Authorization: env:OBSIDIAN_AUTH'
        # Route the local Obsidian calls directly, even when global proxy variables are inherited.
        $processInfo.EnvironmentVariables['NO_PROXY'] = 'localhost,127.0.0.1,::1'
        $processInfo.EnvironmentVariables['no_proxy'] = 'localhost,127.0.0.1,::1'
        $child = New-Object Diagnostics.Process
        $child.StartInfo = $processInfo
        if (-not $child.Start()) { throw '无法创建隧道客户端进程。' }
        $keys = $null
        # The child has inherited these values. Do not retain them on its ProcessStartInfo.
        foreach ($name in @('CONTROL_PLANE_API_KEY', 'OBSIDIAN_AUTH', 'MCP_EXTRA_HEADERS', 'MCP_DISCOVERY_EXTRA_HEADERS')) {
            $processInfo.EnvironmentVariables.Remove($name)
        }
        Write-State 'Running' $child
        Write-RuntimeLog ('已启动 tunnel-client，PID=' + $child.Id + '。连接状态请查看 02-Status.cmd。')
        $outputTask = $child.StandardOutput.ReadLineAsync()
        $errorTask = $child.StandardError.ReadLineAsync()
        $lastCompanionCheck = Get-Date
        while ($true) {
            foreach ($streamName in @('output', 'error')) {
                if ($streamName -eq 'output') { $pendingLine = $outputTask }
                else { $pendingLine = $errorTask }
                while ($null -ne $pendingLine -and $pendingLine.IsCompleted) {
                    $line = $pendingLine.GetAwaiter().GetResult()
                    $nextLine = $null
                    if ($null -ne $line) {
                        Write-RuntimeLog $line
                        if ($streamName -eq 'output') { $nextLine = $child.StandardOutput.ReadLineAsync() }
                        else { $nextLine = $child.StandardError.ReadLineAsync() }
                    }
                    if ($streamName -eq 'output') { $outputTask = $nextLine }
                    else { $errorTask = $nextLine }
                    $pendingLine = $nextLine
                }
            }
            if (Test-Path -LiteralPath $script:StopPath) {
                if (-not $child.HasExited) { $child.Kill() }
                break
            }
            if ($child.HasExited -and $null -eq $outputTask -and $null -eq $errorTask) { break }
            if (((Get-Date) - $lastCompanionCheck).TotalSeconds -ge 30) {
                Start-Companions $config
                $lastCompanionCheck = Get-Date
            }
            Start-Sleep -Milliseconds 250
        }
        $child.WaitForExit()
        $exitCode = $child.ExitCode
        $child.Dispose()
        $child = $null
        if (Test-Path -LiteralPath $script:StopPath) { break }
        Write-State 'Retrying'
        Write-RuntimeLog ('客户端退出，退出码=' + $exitCode + '。15 秒后重新启动。')
        if (-not (Wait-Retry 15)) { break }
    }
} catch {
    $failed = $true
    try { Write-RuntimeLog ('守护程序错误：' + $_.Exception.Message) } catch { }
} finally {
    if ($null -ne $child) {
        try { if (-not $child.HasExited) { $child.Kill() }; $child.Dispose() } catch { }
    }
    if ($ownsMutex) {
        try { Write-State 'Stopped' } catch { }
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
    $script:Redactions = @()
}
if ($failed) { exit 1 }
exit 0
