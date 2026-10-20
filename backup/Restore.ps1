#requires -Version 5.1
param([string]$ZipPath = '', [string]$DestinationParent = '', [string]$ConfigPath = '')
. (Join-Path $PSScriptRoot 'Windows.ps1')
try {
    $config = $null
    try { $config = Read-Config $ConfigPath } catch {}
    if (!$ZipPath) {
        Assert-Windows; Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object Windows.Forms.OpenFileDialog; $dialog.Title = '选择要找回的 backup-日期.zip 版本'; $dialog.Filter = '备份 ZIP|backup-*.zip|ZIP|*.zip'
        if ($config) { $dialog.InitialDirectory = $config.backupPath }
        try { if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { Write-Host '已取消。'; exit 0 }; $ZipPath = $dialog.FileName }
        finally { $dialog.Dispose() }
    }
    if (!$DestinationParent) { Assert-Windows; $DestinationParent = Select-Folder '选择库外的恢复位置；工具会新建文件夹，不覆盖原库' }
    if (!$DestinationParent) { Write-Host '已取消。'; exit 0 }
    $vault = ''; $backups = ''; if ($config) { $vault = $config.vaultPath; $backups = $config.backupPath }
    $folder = Restore-Snapshot $ZipPath $DestinationParent $vault $backups
    Write-Host ('校验通过，已恢复到：' + $folder) -ForegroundColor Green
    Write-Host '原库没有改动。先比较文件；找回单篇时再复制对应文件到原库。插件密钥和其他插件设置需按原配置重新设置。'
} catch { Write-Host ('恢复未完成：' + $_.Exception.Message) -ForegroundColor Red; exit 1 }
