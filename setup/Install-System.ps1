#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$VaultPath, [switch]$Plan)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'System.Common.ps1')
$vault = [IO.Path]::GetFullPath($VaultPath)
if (Test-Within $vault $repository) { throw '目标库必须位于代码仓库之外。' }
if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and @(Get-Process -Name Obsidian -ErrorAction SilentlyContinue).Count -gt 0 -and !$Plan) {
    throw '请先保存笔记并退出 Obsidian，再安装或升级。'
}
Assert-NoLinks $vault
$release = Read-JsonFile (Join-Path $repository 'release.json')
$statePath = Join-Safe $vault '.obsidian/obsidian-ai-workflow-install.json'
$previous = Read-JsonFile $statePath
$owned = @{}
if ($null -ne $previous) { foreach ($item in @($previous.files)) { $owned[$item.path] = $item.sha256 } }
$operations = New-Object Collections.ArrayList
foreach ($entry in @($release.files)) {
    $source = Join-Safe $repository $entry.source
    if (!(Test-Path -LiteralPath $source -PathType Leaf) -or (Hash-File $source) -ne $entry.sha256) { throw ('发布文件校验失败：' + $entry.source) }
    $destination = Join-Safe $vault $entry.destination
    Assert-NoLinks $destination
    $current = Hash-File $destination
    $action = 'Create'
    if ($current -eq $entry.sha256) { $action = 'Unchanged' }
    elseif ($current -and $owned.ContainsKey($entry.destination) -and $owned[$entry.destination] -eq $current) { $action = 'Update' }
    elseif (Test-Path -LiteralPath $destination) { $action = 'Conflict' }
    $null = $operations.Add([pscustomobject]@{path=$entry.destination; source=$entry.source; sha256=$entry.sha256; before=$current; action=$action})
}
# Never downgrade a newer installed custom plugin, even when it was managed before.
foreach ($component in @($release.plugins)) {
    $installed = Read-JsonFile (Join-Safe $vault ('.obsidian/plugins/' + $component.id + '/manifest.json'))
    if ($null -ne $installed -and [version]$installed.version -gt [version]$component.version) {
        foreach ($operation in $operations) { if ($operation.path.StartsWith('.obsidian/plugins/' + $component.id + '/')) { $operation.action = 'Conflict' } }
    }
}
# Only merge the plugin enable list; preserve all unrelated settings and installed plugins.
$communityPath = Join-Safe $vault '.obsidian/community-plugins.json'
Assert-NoLinks $communityPath
$communityBefore = Hash-File $communityPath
$community = @()
if (Test-Path -LiteralPath $communityPath -PathType Leaf) { $community = @(Get-Content -LiteralPath $communityPath -Raw -Encoding UTF8 | ConvertFrom-Json) }
if (@($community | Where-Object { $_ -isnot [string] }).Count) { throw 'community-plugins.json 必须是字符串数组。' }
$enable = @($community)
foreach ($component in @($release.plugins)) {
    $prefix = '.obsidian/plugins/' + $component.id + '/'
    $blocked = @($operations | Where-Object { $_.path.StartsWith($prefix) -and $_.action -eq 'Conflict' }).Count -gt 0
    if (!$blocked -and $enable -notcontains $component.id) { $enable += $component.id }
}
$enableJson = ConvertTo-Json -InputObject @($enable) -Depth 8
$enableBytes = [Text.Encoding]::UTF8.GetBytes($enableJson + "`n")
$enableHash = Hash-Bytes $enableBytes
$communityAction = if ($communityBefore -eq $enableHash) { 'Unchanged' } elseif ($null -eq $communityBefore) { 'Create' } else { 'Update' }
$report = [ordered]@{version=$release.version; vault=$vault; plan=[bool]$Plan; operations=@($operations); conflicts=@($operations | Where-Object action -eq 'Conflict').Count; backup=$null}
if ($Plan) { $report | ConvertTo-Json -Depth 12; return }
$null = [IO.Directory]::CreateDirectory($vault)
$lockPath = Join-Safe $vault '.obsidian/obsidian-ai-workflow.install.lock'
$null = [IO.Directory]::CreateDirectory((Split-Path -Parent $lockPath))
$lock = $null
try { $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
catch { throw '另一个安装或恢复进程正在运行。' }
try {
    $backup = Join-Safe $vault ('.obsidian/obsidian-ai-workflow-backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
    $null = [IO.Directory]::CreateDirectory($backup)
    $journal = [ordered]@{schemaVersion=1; version=$release.version; vault=$vault; files=@(); committed=$false}
    $journalPath = Join-Path $backup 'restore.json'
    $report.backup = $journalPath
    $toWrite = @($operations | Where-Object { $_.action -in @('Create','Update') })
    if ($communityAction -ne 'Unchanged') { $toWrite += [pscustomobject]@{path='.obsidian/community-plugins.json'; source=$null; sha256=$enableHash; before=$communityBefore; action=$communityAction} }
    $stateBefore = Hash-File $statePath
    # Stage a recovery journal before changing any destination.
    foreach ($operation in $toWrite) {
        $destination = Join-Safe $vault $operation.path
        if ((Hash-File $destination) -ne $operation.before) { throw ('安装前文件已变化：' + $operation.path) }
        if ($null -ne $operation.before) { $copy = Join-Safe $backup ('files/' + $operation.path); $null = [IO.Directory]::CreateDirectory((Split-Path -Parent $copy)); [IO.File]::Copy($destination,$copy,$false) }
        $journal.files += [pscustomobject]@{path=$operation.path; before=$operation.before; after=$operation.sha256}
    }
    if ($null -ne $stateBefore) { [IO.File]::Copy($statePath,(Join-Path $backup 'previous-state.json'),$false) }
    Save-Json $journalPath $journal
    foreach ($operation in $toWrite) {
        $destination = Join-Safe $vault $operation.path
        Assert-NoLinks $destination
        if ((Hash-File $destination) -ne $operation.before) { throw ('安装期间文件已变化，已停止：' + $operation.path) }
        if ($null -eq $operation.source) { $bytes = $enableBytes }
        else { $bytes = [IO.File]::ReadAllBytes((Join-Safe $repository $operation.source)) }
        Write-Atomic $destination $bytes
    }
    $newOwned = @{}
    foreach ($key in $owned.Keys) { $newOwned[$key] = $owned[$key] }
    foreach ($operation in $operations) { if ($operation.action -ne 'Conflict') { $newOwned[$operation.path] = $operation.sha256 } }
    $state = [ordered]@{schemaVersion=1; version=$release.version; installedAt=(Get-Date).ToString('o'); files=@($newOwned.Keys | Sort-Object | ForEach-Object { [pscustomobject]@{path=$_;sha256=$newOwned[$_]} })}
    if ((Hash-File $statePath) -ne $stateBefore) { throw '安装状态已被其他进程修改，未覆盖。' }
    Save-Json $statePath $state
    $journal.stateAfter = Hash-File $statePath
    $journal.committed = $true
    Save-Json $journalPath $journal
    $report | ConvertTo-Json -Depth 12
} finally { if ($null -ne $lock) { $lock.Dispose() } }
