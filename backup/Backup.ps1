#requires -Version 5.1
param([string]$ConfigPath = '', [switch]$Force)
. (Join-Path $PSScriptRoot 'Windows.ps1')
if (!$ConfigPath) { $ConfigPath = Join-Path (Get-ToolRoot) 'settings.json' }
$statusPath = Join-Path ([IO.Path]::GetDirectoryName((Get-FullPath $ConfigPath))) 'last-run.json'
try {
    $config = Read-Config $ConfigPath
    $result = Invoke-VaultBackup $config -Force:$Force
    Write-JsonAtomic $statusPath $result
    if ($result.state -eq 'created') { Write-Host ('已备份：' + $result.name) -ForegroundColor Green }
    else { Write-Host ('内容未变化，沿用已校验版本：' + $result.name) -ForegroundColor Green }
    Write-Host ('文件：' + $result.fileCount + '；排除项：' + $result.excludedCount)
    Write-Host ('备份目录：' + $config.backupPath)
} catch {
    $message = $_.Exception.Message
    try { Write-JsonAtomic $statusPath ([pscustomobject]@{state='failed'; checkedAt=[DateTimeOffset]::Now.ToString('o'); error=$message}) } catch {}
    Write-Host ('备份未完成，已有版本保留：' + $message) -ForegroundColor Red
    exit 1
}
