#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ManifestPath,[switch]$Plan)
Set-StrictMode -Version 2.0
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'System.Common.ps1')
$manifest = [IO.Path]::GetFullPath($ManifestPath)
$journal = Read-JsonFile $manifest
if ($null -eq $journal -or $journal.schemaVersion -ne 1) { throw '恢复清单格式不正确。' }
$vault = [IO.Path]::GetFullPath($journal.vault)
$backup = Split-Path -Parent $manifest
if (!(Test-Within $backup (Join-Safe $vault '.obsidian/obsidian-ai-workflow-backups'))) { throw '恢复清单不属于此库。' }
if (!$Plan -and [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and @(Get-Process -Name Obsidian -ErrorAction SilentlyContinue).Count) { throw '恢复前请保存笔记并退出 Obsidian。' }
Assert-NoLinks $vault; Assert-NoLinks $backup
$conflicts=@()
foreach ($item in @($journal.files)) {
    $destination=Join-Safe $vault $item.path;Assert-NoLinks $destination
    $current=Hash-File $destination
    if ($current -ne $item.after -and $current -ne $item.before) { $conflicts += $item.path }
    if ($null -ne $item.before -and (Hash-File (Join-Safe $backup ('files/'+$item.path))) -ne $item.before) { throw ('恢复副本校验失败：'+$item.path) }
}
$statePath=Join-Safe $vault '.obsidian/obsidian-ai-workflow-install.json'
if ($journal.committed -and (Hash-File $statePath) -ne $journal.stateAfter) { $conflicts += '.obsidian/obsidian-ai-workflow-install.json' }
if ($Plan) { [pscustomobject]@{vault=$vault;files=@($journal.files).Count;conflicts=$conflicts} | ConvertTo-Json -Depth 8;return }
if ($conflicts.Count) { throw ('安装后文件已修改，恢复已停止：'+($conflicts -join ', ')) }
$lockPath=Join-Safe $vault '.obsidian/obsidian-ai-workflow.install.lock'
$lock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
    foreach ($item in @($journal.files)) {
        $destination=Join-Safe $vault $item.path;Assert-NoLinks $destination
        $current=Hash-File $destination
        if ($current -eq $item.before) { continue }
        if ($current -ne $item.after) { throw ('恢复期间文件发生变化：'+$item.path) }
        if ($null -eq $item.before) { [IO.File]::Delete($destination) }
        else { Write-Atomic $destination ([IO.File]::ReadAllBytes((Join-Safe $backup ('files/'+$item.path)))) }
    }
    if ($journal.committed) {
        $prior=Join-Path $backup 'previous-state.json'
        if (Test-Path -LiteralPath $prior -PathType Leaf) { Write-Atomic $statePath ([IO.File]::ReadAllBytes($prior)) }
        elseif (Test-Path -LiteralPath $statePath -PathType Leaf) { [IO.File]::Delete($statePath) }
    }
    [pscustomobject]@{restored=$true;vault=$vault;files=@($journal.files).Count} | ConvertTo-Json
} finally { $lock.Dispose() }
