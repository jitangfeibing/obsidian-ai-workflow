#requires -Version 5.1
. (Join-Path $PSScriptRoot 'Core.ps1')
function Assert-Windows {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw '图形设置和自动备份需要在你的 Windows 电脑运行。' }
}
function Get-ToolRoot { return (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ObsidianVaultBackup') }
function Select-Folder([string]$Description, [string]$Initial = '') {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Description; $dialog.ShowNewFolderButton = $true
    if ($Initial) { $dialog.SelectedPath = $Initial }
    try { if ($dialog.ShowDialog() -eq [Windows.Forms.DialogResult]::OK) { return $dialog.SelectedPath }; return $null }
    finally { $dialog.Dispose() }
}
function Get-TaskName($Config) { return ('ObsidianVaultBackup-' + $Config.vaultId) }
function Get-StartupLink($Config) { return (Join-Path ([Environment]::GetFolderPath('Startup')) ((Get-TaskName $Config) + '.lnk')) }
function Read-Config([string]$Path = '') {
    if (!$Path) { $Path = Join-Path (Get-ToolRoot) 'settings.json' }
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw '尚未设置。请先运行 01-Setup.cmd。' }
    $config = Read-Json $Path
    if ($config.format -ne 1 -or $config.vaultId -notmatch '^[a-f0-9]{32}$') { throw '设置文件格式不正确，请核对 settings.json。' }
    Assert-Separate $config.vaultPath $config.backupPath
    return $config
}
function Register-BackupTask($Config, [string]$ToolRoot, [string]$UserName, [string]$PowerShellExe) {
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -ConfigPath "{1}"' -f (Join-Path $ToolRoot 'Backup.ps1'), (Join-Path $ToolRoot 'settings.json')
    $action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $arguments -WorkingDirectory $ToolRoot
    $login = New-ScheduledTaskTrigger -AtLogOn -User $UserName; $login.Delay = 'PT60S'
    $daily = New-ScheduledTaskTrigger -Daily -At '21:00'
    $principal = New-ScheduledTaskPrincipal -UserId $UserName -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    $null = Register-ScheduledTask -TaskName (Get-TaskName $Config) -Action $action -Trigger @($login,$daily) -Principal $principal -Settings $settings -Description 'Obsidian 笔记与附件本地版本备份；登录后及每日 21:00，内容未变不重复生成版本。' -Force
}
function Enable-AutoBackup($Config, [string]$ToolRoot) {
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -ConfigPath "{1}"' -f (Join-Path $ToolRoot 'Backup.ps1'), (Join-Path $ToolRoot 'settings.json')
    $taskName = Get-TaskName $Config; $startup = Get-StartupLink $Config
    try {
        $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        Register-BackupTask $Config $ToolRoot $user $powershell
    } catch {
        $taskError = $_.Exception.Message
        $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($startup)
        $shortcut.TargetPath = $powershell; $shortcut.Arguments = $arguments; $shortcut.WorkingDirectory = $ToolRoot; $shortcut.WindowStyle = 7; $shortcut.Save()
        Write-Host ('任务注册受当前 Windows 策略限制：' + $taskError) -ForegroundColor Yellow
        Write-Host '已改为登录时备份一次；每日 21:00 未启用。也可随时点击「立即备份」。' -ForegroundColor Yellow
        return 'StartupOnly'
    }
    if ([IO.File]::Exists($startup)) { try { [IO.File]::Delete($startup) } catch { Write-Host '任务已注册，但旧登录快捷方式未能移除；并发锁会防止重复执行。' -ForegroundColor Yellow } }
    return 'ScheduledTask'
}
