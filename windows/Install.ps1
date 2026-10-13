#requires -Version 5.1
param([switch]$ResetKeys)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Windows
Write-Host 'Obsidian 隧道：本机加密密钥 + 登录自动启动' -ForegroundColor Cyan
Write-Host '请先打开 Obsidian 的目标库和 Clash。无需管理员身份运行。'

# Parse every shipped script before making changes, using the native PowerShell parser.
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1') {
    $tokens = $null
    $parseErrors = $null
    [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
    if ($null -ne $parseErrors -and $parseErrors.Count -gt 0) { throw ('脚本语法检查失败：' + $file.Name) }
}
$clientExe = 'D:\app\tunnel-client-v0.0.16-windows-amd64\tunnel-client.exe'
if (Test-Path -LiteralPath $script:ConfigPath) {
    $previous = Read-Config
    $clientExe = $previous.ClientExe
}
if (-not (Test-Path -LiteralPath $clientExe)) {
    $clientExe = (Read-Host '请输入 tunnel-client.exe 的完整路径').Trim().Trim('"')
}
if (-not (Test-Path -LiteralPath $clientExe -PathType Leaf)) { throw '找不到隧道客户端。安装已停止。' }
if ([IO.Path]::GetFileName($clientExe) -ine 'tunnel-client.exe') { throw '请选择 tunnel-client.exe 文件。' }
$profilePath = Join-Path $env:APPDATA 'tunnel-client\obsidian.yaml'
if (-not (Test-Path -LiteralPath $profilePath)) {
    throw ('找不到现有配置：' + $profilePath + '。请使用之前配置隧道的 Windows 账户运行。')
}
$obsidianExe = Find-RunningApp @('Obsidian')
$clashExe = Find-RunningApp @('clash-verge', 'Clash Verge')
if (-not $obsidianExe -or -not $clashExe) {
    throw '请先打开 Obsidian 和 Clash Verge，然后重新运行安装程序。程序需要记录它们的实际安装路径。'
}
Protect-AppFolder
if ($ResetKeys -or -not (Test-Path -LiteralPath $script:SecretsPath)) {
    Save-Keys 'http://127.0.0.1:27123/mcp/'
} else {
    $existingKeys = Read-Keys
    if (-not (Test-Obsidian 'http://127.0.0.1:27123/mcp/' $existingKeys.Obsidian)) {
        throw '已保存的 Obsidian 密钥验证失败。打开正确的库，或运行 05-UpdateKeys.cmd。'
    }
    $existingKeys = $null
    Write-Host '沿用已加密保存的密钥。'
}

if (Test-Path -LiteralPath $script:ConfigPath) { Stop-Background }
# Only replace a client at this executable path using the obsidian profile.
# Other tunnel profiles and other applications are not stopped.
foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name = 'tunnel-client.exe'")) {
    if ([string]::Equals($process.ExecutablePath, $clientExe, [StringComparison]::OrdinalIgnoreCase) -and
        $process.CommandLine -match '(?:^|\s)--profile(?:=|\s+)"?obsidian"?(?:\s|$)') {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -File) {
    if ($file.Extension -notin @('.ps1', '.cmd', '.md')) { continue }
    $destination = Join-Path $script:AppRoot $file.Name
    if (-not [string]::Equals($file.FullName, $destination, [StringComparison]::OrdinalIgnoreCase)) {
        Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    }
    Unblock-File -LiteralPath $destination -ErrorAction SilentlyContinue
}
$config = [ordered]@{
    ClientExe = $clientExe
    Profile = 'obsidian'
    McpUrl = 'http://127.0.0.1:27123/mcp/'
    ProxyUrl = 'http://127.0.0.1:7897'
    ObsidianExe = $obsidianExe
    ClashExe = $clashExe
    StartupMode = 'ScheduledTask'
}
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$runnerPath = Join-Path $script:AppRoot 'Runner.ps1'
$arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -AutoStart' -f $runnerPath
try {
    $action = New-ScheduledTaskAction -Execute $powershellExe -Argument $arguments -WorkingDirectory $script:AppRoot
    $userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
    $trigger.Delay = 'PT20S'
    $principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    $task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings
    Register-ScheduledTask -TaskName $script:TaskName -InputObject $task -Force | Out-Null
    Remove-Item -LiteralPath $script:StartupLink -Force -ErrorAction SilentlyContinue
    Write-Host '已注册当前账户的登录启动任务。' -ForegroundColor Green
} catch {
    # Some Windows policies deny non-admin task registration. Use a user Startup shortcut instead.
    $config.StartupMode = 'StartupFolder'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($script:StartupLink)
    $shortcut.TargetPath = $powershellExe
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $script:AppRoot
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host '此电脑限制任务注册，已改用当前账户的启动文件夹。客户端退出后仍会自动重试。' -ForegroundColor Yellow
}
$config | ConvertTo-Json | Set-Content -LiteralPath $script:ConfigPath -Encoding UTF8
Remove-Item -LiteralPath $script:StopPath -Force -ErrorAction SilentlyContinue
Start-Background
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
foreach ($entry in @(@('Obsidian Tunnel - Status.lnk', '02-Status.cmd'), @('Obsidian Tunnel - Start.lnk', '03-Start.cmd'))) {
    $shortcut = $shell.CreateShortcut((Join-Path $desktop $entry[0]))
    $shortcut.TargetPath = Join-Path $script:AppRoot $entry[1]
    $shortcut.WorkingDirectory = $script:AppRoot
    $shortcut.Save()
}
Write-Host ''
Write-Host '安装完成。后台启动已提交，可以关闭此窗口。' -ForegroundColor Green
Write-Host '桌面有 Status 和 Start 快捷方式；稍等后双击 Status 查看实际连接状态。'
Write-Host ('配置与日志目录：' + $script:AppRoot)
Write-Host '以后登录 Windows 后自动启动，不必重新输入密钥。电脑睡眠、关机或退出登录时服务会停止。'
