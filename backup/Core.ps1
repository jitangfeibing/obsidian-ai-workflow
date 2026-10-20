#requires -Version 5.1
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-FullPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw '路径不能为空。' }
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -eq [IO.Path]::GetPathRoot($full)) { return $full }
    return $full.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
}
function Test-Within([string]$Child, [string]$Parent) {
    $c = Get-FullPath $Child; $p = Get-FullPath $Parent
    $prefix = $p.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    return $c.Equals($p, [StringComparison]::OrdinalIgnoreCase) -or $c.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}
function Assert-PlainPath([string]$Path) {
    $p = Get-FullPath $Path
    while ($p) {
        if (Test-Path -LiteralPath $p) {
            $item = Get-Item -LiteralPath $p -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw ('请选择实际目录，不使用符号链接或目录联接：' + $p) }
        }
        $parent = [IO.Path]::GetDirectoryName($p)
        if ($parent -eq $p) { break }; $p = $parent
    }
}
function Assert-Separate([string]$Vault, [string]$Backup) {
    if ((Test-Within $Backup $Vault) -or (Test-Within $Vault $Backup)) { throw '备份目录与库目录必须分开，不能互相包含。请选择库外的独立文件夹。' }
    Assert-PlainPath $Vault; Assert-PlainPath $Backup
}
function Write-JsonAtomic([string]$Path, $Value) {
    $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path))
    $temp = $Path + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
    $previous = $Path + '.' + [guid]::NewGuid().ToString('N') + '.previous'
    try {
        [IO.File]::WriteAllText($temp, (ConvertTo-Json -InputObject $Value -Depth 16), (New-Object Text.UTF8Encoding($false)))
        if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temp, $Path, $previous) }
        else { [IO.File]::Move($temp, $Path) }
    } finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }; if ([IO.File]::Exists($previous)) { [IO.File]::Delete($previous) } }
}
function Read-Json([string]$Path) {
    return (ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path)))
}
function Get-StreamHash([IO.Stream]$Stream) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Get-FileHashSafe([string]$Path) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try { return Get-StreamHash $stream } finally { $stream.Dispose() }
}
function Get-TextHash([string]$Text) {
    $stream = New-Object IO.MemoryStream(,[Text.Encoding]::UTF8.GetBytes($Text))
    try { return Get-StreamHash $stream } finally { $stream.Dispose() }
}
function Test-RelativeName([string]$Name) {
    if (!$Name -or $Name.Length -gt 2000 -or $Name -match '[\\:\x00-\x1f<>"|?*]' -or $Name.StartsWith('/') -or $Name.EndsWith('/')) { return $false }
    foreach ($part in $Name.Split('/')) {
        if (!$part -or $part -in @('.', '..') -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') { return $false }
    }
    return $true
}
function Get-PathPolicy([string]$Relative, [bool]$Directory) {
    $parts = $Relative.Split('/'); $name = $parts[-1]; $top = $parts[0]
    if ($top -in @('Obsidian-Home-Workspace', 'Obsidian-Project-Page-Helper', 'Obsidian-Vault-Backup', 'Obsidian-Home-Workspace.zip', 'Obsidian-Project-Page-Helper.zip', 'Obsidian-Vault-Backup.zip')) { return '安装包副本' }
    if ($name -match '^(?i:\.env(?:\..*)?|keys\.xml|secrets\.json|credentials\.json)$' -or $name -match '(?i)\.(pem|key|p12|pfx)$') { return '凭证文件' }
    if ($top -eq '.obsidian') {
        if ($parts.Count -eq 1) { return '' }
        if ($parts | Select-Object -Skip 1 | Where-Object { $_.StartsWith('.') }) { return '隐藏配置文件' }
        if ($parts[1] -in @('snippets', 'themes')) {
            if ($parts | Where-Object { $_ -ne '.obsidian' -and $_.StartsWith('.') }) { return '隐藏配置文件' }
            return ''
        }
        if ($parts[1] -eq 'plugins') {
            if ($name -eq 'data.json') { return '插件设置（可能包含密钥）' }
            if ($parts.Count -le 3 -and $Directory) { return '' }
            if ($parts.Count -eq 4 -and !$Directory -and $name -in @('manifest.json', 'main.js', 'styles.css')) { return '' }
            if ($parts.Count -ge 4 -and $parts[3] -eq 'assets') { return '' }
            return '插件设置或缓存（含密钥的 data.json 不备份）'
        }
        if ($parts.Count -eq 2 -and !$Directory -and $name -in @('app.json', 'appearance.json', 'hotkeys.json', 'community-plugins.json', 'core-plugins.json', 'types.json')) { return '' }
        return '会话或未列入白名单的配置'
    }
    if ($parts | Where-Object { $_.StartsWith('.') }) { return '隐藏目录或文件' }
    return ''
}
function Get-VaultInventory([string]$VaultPath) {
    $root = Get-FullPath $VaultPath; Assert-PlainPath $root
    if (!(Test-Path -LiteralPath (Join-Path $root 'personal-system-starter') -PathType Container)) { throw '库内找不到 personal-system-starter，停止备份以免选错库。' }
    $files = New-Object 'Collections.Generic.List[object]'; $excluded = New-Object 'Collections.Generic.List[object]'
    $queue = New-Object 'Collections.Generic.Queue[IO.DirectoryInfo]'; $queue.Enqueue((New-Object IO.DirectoryInfo($root)))
    while ($queue.Count -gt 0) {
        $dir = $queue.Dequeue()
        foreach ($item in $dir.EnumerateFileSystemInfos()) {
            $relative = $item.FullName.Substring($root.Length + 1).Replace('\', '/')
            $isDir = ($item.Attributes -band [IO.FileAttributes]::Directory) -ne 0
            $reason = Get-PathPolicy $relative $isDir
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { $reason = '符号链接或目录联接，未跟随' }
            if ($reason) { $excluded.Add([pscustomobject]@{path=$relative; reason=$reason}); continue }
            if (!(Test-RelativeName $relative)) { throw ('无法安全保存这个文件名：' + $relative) }
            if ($isDir) { $queue.Enqueue([IO.DirectoryInfo]$item); continue }
            $hash = Get-FileHashSafe $item.FullName; $item.Refresh()
            $files.Add([pscustomobject]@{path=$relative; size=[long]$item.Length; sha256=$hash; lastWriteUtc=$item.LastWriteTimeUtc.ToString('o')})
        }
    }
    $sorted = @($files.ToArray() | Sort-Object -Property path)
    if (!$sorted.Count) { throw '没有可备份文件，停止以保留原版本。' }
    $names = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in $sorted) { if (!$names.Add($file.path)) { throw ('存在大小写冲突的文件：' + $file.path) } }
    $fingerprint = Get-TextHash (($sorted | ForEach-Object { $_.path + "`t" + $_.sha256 }) -join "`n")
    return [pscustomobject]@{files=$sorted; excluded=@($excluded.ToArray()); fingerprint=$fingerprint}
}
function Get-SnapshotManifest($Archive) {
    $entry = $Archive.GetEntry('backup-manifest.json')
    if (!$entry -or $entry.Length -gt 16777216) { throw '备份清单缺失或过大。' }
    $reader = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8)
    try { $manifest = ConvertFrom-Json -InputObject $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($manifest.format -ne 1 -or $manifest.tool -ne 'ObsidianVaultBackup' -or $manifest.policy -ne 'safe-config-v1') { throw '这不是本工具支持的备份版本。' }
    return $manifest
}
function Test-SnapshotArchive($Archive) {
    $manifest = Get-SnapshotManifest $Archive; $files = @($manifest.files)
    if (!$files.Count -or $files.Count -gt 200000 -or $Archive.Entries.Count -ne ($files.Count + 1)) { throw '备份文件数量与清单不符。' }
    $entries = New-Object 'Collections.Generic.Dictionary[string,object]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $Archive.Entries) {
        if ($entries.ContainsKey($entry.FullName)) { throw '备份里存在重复或大小写冲突的路径。' }
        $entries.Add($entry.FullName, $entry)
    }
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in $files) {
        if ($file.path -isnot [string] -or !(Test-RelativeName $file.path) -or (Get-PathPolicy $file.path $false) -or !$seen.Add($file.path)) { throw '备份清单含不支持的路径。' }
        if ($file.sha256 -notmatch '^[a-f0-9]{64}$' -or $file.size -isnot [ValueType] -or [long]$file.size -lt 0) { throw '备份清单的校验信息无效。' }
        $parsedTime = [datetime]::MinValue
        if (![datetime]::TryParse([string]$file.lastWriteUtc, [ref]$parsedTime)) { throw '备份文件日期无效。' }
        $entryName = 'vault/' + $file.path
        if (!$entries.ContainsKey($entryName) -or $entries[$entryName].FullName -cne $entryName) { throw ('备份缺少原文件：' + $file.path) }
        $entry = $entries[$entryName]
        if ($entry.Length -ne [long]$file.size) { throw ('备份大小不符：' + $file.path) }
        $stream = $entry.Open()
        try { if ((Get-StreamHash $stream) -cne $file.sha256) { throw ('备份校验失败：' + $file.path) } }
        finally { $stream.Dispose() }
    }
    $fingerprint = Get-TextHash ((@($files | Sort-Object -Property path) | ForEach-Object { $_.path + "`t" + $_.sha256 }) -join "`n")
    if ($fingerprint -ne $manifest.fingerprint) { throw '备份清单指纹不符。' }
    return $manifest
}
function Test-Snapshot([string]$ZipPath) {
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try { Assert-SnapshotSidecar $ZipPath; return Test-SnapshotArchive $archive } finally { $archive.Dispose() }
}
function Assert-SnapshotSidecar([string]$ZipPath) {
    if ([IO.File]::Exists($ZipPath + '.json')) {
        $sidecar = Read-Json ($ZipPath + '.json')
        if ($sidecar.format -ne 1 -or $sidecar.zipSha256 -notmatch '^[a-f0-9]{64}$' -or (Get-FileHashSafe $ZipPath) -ne $sidecar.zipSha256) { throw '整包校验与配套 JSON 不符，请选择其他版本。' }
    }
}
function Invoke-VaultBackup($Config, [switch]$Force) {
    $root = Get-FullPath $Config.vaultPath; $dest = Get-FullPath $Config.backupPath
    Assert-Separate $root $dest; $null = [IO.Directory]::CreateDirectory($dest)
    $lock = [IO.File]::Open((Join-Path $dest '.backup.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        for ($attempt = 0; $attempt -lt 2; $attempt++) {
            $inventory = Get-VaultInventory $root; $latestPath = Join-Path $dest 'latest.json'; $latest = $null
            if ([IO.File]::Exists($latestPath)) { try {
                $latest = Read-Json $latestPath
                foreach ($key in @('vaultId','fingerprint','name','zipSha256')) { if (!$latest.PSObject.Properties[$key]) { $latest = $null; break } }
            } catch { $latest = $null } }
            if (!$Force -and $latest -and $latest.vaultId -eq $Config.vaultId -and $latest.fingerprint -eq $inventory.fingerprint -and $latest.name -match '^backup-\d{8}-\d{6}-[a-f0-9]{8}\.zip$') {
                $oldZip = Join-Path $dest $latest.name
                if ([IO.File]::Exists($oldZip) -and (Get-FileHashSafe $oldZip) -eq $latest.zipSha256) {
                    $oldManifest = $null
                    try { $oldManifest = Test-Snapshot $oldZip } catch { $oldManifest = $null }
                    if ($oldManifest -and $oldManifest.fingerprint -eq $inventory.fingerprint -and $oldManifest.vaultId -eq $Config.vaultId) {
                        return [pscustomobject]@{state='unchanged'; name=$latest.name; fileCount=$inventory.files.Count; excludedCount=$inventory.excluded.Count; checkedAt=[DateTimeOffset]::Now.ToString('o'); zipSha256=$latest.zipSha256}
                    }
                }
            }
            $name = 'backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.zip'
            $partial = Join-Path $dest ('.' + $name + '.partial'); $target = Join-Path $dest $name
            try {
                $manifest = [ordered]@{format=1; tool='ObsidianVaultBackup'; version='1.0.0'; policy='safe-config-v1'; vaultId=$Config.vaultId; sourceVault=$root; createdAt=[DateTimeOffset]::Now.ToString('o'); fingerprint=$inventory.fingerprint; files=$inventory.files; excluded=$inventory.excluded}
                $zip = [IO.Compression.ZipFile]::Open($partial, [IO.Compression.ZipArchiveMode]::Create)
                try {
                    foreach ($file in $inventory.files) {
                        $source = Join-Path $root $file.path; Assert-PlainPath $source
                        $inputStream = [IO.File]::Open($source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
                        try {
                            $entry = $zip.CreateEntry(('vault/' + $file.path), [IO.Compression.CompressionLevel]::Optimal); $output = $entry.Open()
                            try { $inputStream.CopyTo($output) } finally { $output.Dispose() }
                        } finally { $inputStream.Dispose() }
                    }
                    $entry = $zip.CreateEntry('backup-manifest.json'); $writer = New-Object IO.StreamWriter($entry.Open(), (New-Object Text.UTF8Encoding($false)))
                    try { $writer.Write((ConvertTo-Json -InputObject $manifest -Depth 16)) } finally { $writer.Dispose() }
                } finally { $zip.Dispose() }
                $after = Get-VaultInventory $root
                if ($after.fingerprint -ne $inventory.fingerprint) {
                    if ($attempt -eq 0) { continue }; throw '备份期间文件持续变化，未发布新版本。请稍后重试，批量整理时可先退出 Obsidian。'
                }
                $null = Test-Snapshot $partial
                $sha = Get-FileHashSafe $partial; [IO.File]::Move($partial, $target)
                $record = [pscustomobject]@{format=1; vaultId=$Config.vaultId; name=$name; fingerprint=$inventory.fingerprint; createdAt=$manifest.createdAt; zipSha256=$sha; bytes=(Get-Item -LiteralPath $target).Length; fileCount=$inventory.files.Count; excludedCount=$inventory.excluded.Count}
                Write-JsonAtomic ($target + '.json') $record; Write-JsonAtomic $latestPath $record
                return [pscustomobject]@{state='created'; name=$name; fileCount=$inventory.files.Count; excludedCount=$inventory.excluded.Count; checkedAt=[DateTimeOffset]::Now.ToString('o'); zipSha256=$sha}
            } finally { if ([IO.File]::Exists($partial)) { [IO.File]::Delete($partial) } }
        }
    } finally { $lock.Dispose() }
}
function Restore-Snapshot([string]$ZipPath, [string]$DestinationParent, [string]$VaultPath = '', [string]$BackupPath = '') {
    $parent = Get-FullPath $DestinationParent; Assert-PlainPath $parent
    if (!(Test-Path -LiteralPath $parent -PathType Container)) { throw '请选择已存在的恢复目标父文件夹。' }
    if (($VaultPath -and (Test-Within $parent $VaultPath)) -or ($BackupPath -and (Test-Within $parent $BackupPath))) { throw '恢复目录请选择库与备份目录以外的位置。' }
    $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath); $stage = $null
    try {
        Assert-SnapshotSidecar $ZipPath
        $manifest = Test-SnapshotArchive $zip
        if ($VaultPath -and !(Get-FullPath $manifest.sourceVault).Equals((Get-FullPath $VaultPath), [StringComparison]::OrdinalIgnoreCase)) { Write-Host '此版本来自不同位置的库，将单独恢复供核对。' -ForegroundColor Yellow }
        if (Test-Within $parent $manifest.sourceVault) { throw '恢复位置不能位于备份所记录的原库内。' }
        $suffix = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
        $stage = Join-Path $parent ('.obsidian-restore-' + $suffix); $final = Join-Path $parent ('Obsidian-Restored-' + $suffix)
        if (Test-Path -LiteralPath $stage) { throw '恢复临时目录已存在。' }
        $null = [IO.Directory]::CreateDirectory($stage)
        foreach ($file in @($manifest.files)) {
            $target = Join-Path $stage $file.path
            if (!(Test-Within $target $stage)) { throw '恢复路径越界，已停止。' }
            $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)); Assert-PlainPath ([IO.Path]::GetDirectoryName($target))
            $entry = $zip.GetEntry(('vault/' + $file.path)); $inputStream = $entry.Open(); $output = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $inputStream.CopyTo($output) } finally { $output.Dispose(); $inputStream.Dispose() }
            if ((Get-FileHashSafe $target) -ne $file.sha256) { throw '恢复后校验失败，未发布恢复文件夹。' }
            [IO.File]::SetLastWriteTimeUtc($target, [datetime]::Parse($file.lastWriteUtc).ToUniversalTime())
        }
        [IO.Directory]::Move($stage, $final); $stage = $null
        return $final
    } finally {
        $zip.Dispose()
        if ($stage -and [IO.Directory]::Exists($stage)) { Write-Host ('恢复未完成，原库保持原状。临时文件在：' + $stage) -ForegroundColor Yellow }
    }
}
