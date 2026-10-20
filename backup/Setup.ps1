#requires -Version 5.1
param([string]$VaultPath = '', [string]$BackupParent = '')
. (Join-Path $PSScriptRoot 'Windows.ps1')
try {
    Assert-Windows
    foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1') {
        $tokens = $null; $errors = $null; $null = [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
        if ($errors.Count) { throw ('脚本语法检查失败：' + $file.Name) }
    }
    $checks = Read-Json (Join-Path $PSScriptRoot 'checksums.json')
    foreach ($p in $checks.PSObject.Properties) {
        if ($p.Name -match '[\\/]') { throw ('安装文件校验失败：' + $p.Name) }
        $text=[IO.File]::ReadAllText((Join-Path $PSScriptRoot $p.Name)).Replace("`r`n","`n")
        $hasher=[Security.Cryptography.SHA256]::Create()
        try { $actual=([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant() }
        finally { $hasher.Dispose() }
        if ($actual -ne $p.Value) { throw ('安装文件校验失败：' + $p.Name) }
    }
    $toolRoot = Get-ToolRoot; $configPath = Join-Path $toolRoot 'settings.json'
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $config = Read-Config $configPath
        Write-Host '沿用已保存的库与备份位置；更新工具，不删除旧备份。'
    } else {
        if (!$VaultPath) { $VaultPath = Select-Folder '选择同时包含 .obsidian 与 personal-system-starter 的实际库根目录' }
        if (!$VaultPath) { Write-Host '已取消。'; exit 0 }
        $VaultPath = Get-FullPath $VaultPath
        if (!(Test-Path -LiteralPath (Join-Path $VaultPath '.obsidian') -PathType Container) -or !(Test-Path -LiteralPath (Join-Path $VaultPath 'personal-system-starter') -PathType Container)) { throw '请选择真正的库根目录。' }
        if (!$BackupParent) { $BackupParent = Select-Folder '选择库外的备份父文件夹，建议使用另一块磁盘或移动硬盘' }
        if (!$BackupParent) { Write-Host '已取消。'; exit 0 }
        $id = [guid]::NewGuid().ToString('N'); $BackupParent = Get-FullPath $BackupParent
        $backupPath = Join-Path $BackupParent ('ObsidianBackups-' + $id.Substring(0,8))
        Assert-Separate $VaultPath $BackupParent
        if (Test-Within $PSScriptRoot $VaultPath) { throw '请把工具包解压到库外的新文件夹后再设置。' }
        $config = [pscustomobject]@{format=1; vaultId=$id; vaultPath=$VaultPath; backupPath=$backupPath; autoMode='Disabled'}
    }
    $null = [IO.Directory]::CreateDirectory($toolRoot)
    foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -File) {
        if ($file.Extension -notin @('.ps1','.cmd','.md','.json') -or $file.Name -eq 'settings.json') { continue }
        $target = Join-Path $toolRoot $file.Name
        if (!(Get-FullPath $file.FullName).Equals((Get-FullPath $target),[StringComparison]::OrdinalIgnoreCase)) { Copy-Item -LiteralPath $file.FullName -Destination $target -Force }
        Unblock-File -LiteralPath $target -ErrorAction SilentlyContinue
    }
    # Publish a recoverable configuration and create the first backup before enabling triggers.
    Write-JsonAtomic $configPath $config
    $result = Invoke-VaultBackup $config
    Write-JsonAtomic (Join-Path $toolRoot 'last-run.json') $result
    $config.autoMode = Enable-AutoBackup $config $toolRoot
    Write-JsonAtomic $configPath $config
    $shell = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop')
    foreach ($entry in @(@('Obsidian Backup - Now.lnk','02-BackupNow.cmd'),@('Obsidian Backup - Status.lnk','04-Status.cmd'),@('Obsidian Backup - Restore.lnk','03-Restore.cmd'))) {
        $shortcut = $shell.CreateShortcut((Join-Path $desktop $entry[0])); $shortcut.TargetPath = Join-Path $toolRoot $entry[1]; $shortcut.WorkingDirectory = $toolRoot; $shortcut.Save()
    }
    Write-Host '设置完成，首份备份已校验；桌面已有立即备份、状态和恢复入口。' -ForegroundColor Green
    Write-Host ('自动方式：' + $config.autoMode + '；版本：' + $result.name)
    Write-Host ('备份位置：' + $config.backupPath)
    Write-Host '旧版本会一直保留，不自动删除。普通 ZIP 未加密，只保存在你选择的位置。'
} catch { Write-Host ('设置未完成：' + $_.Exception.Message) -ForegroundColor Red; exit 1 }
