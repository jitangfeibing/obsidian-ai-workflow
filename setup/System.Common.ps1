#requires -Version 5.1
function Test-Within([string]$Path,[string]$Parent) {
    $prefix = $Parent.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    return $Path.Equals($Parent,[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)
}
function Join-Safe([string]$Root,[string]$Relative) {
    if ([string]::IsNullOrWhiteSpace($Relative) -or $Relative -match '[\\:\x00-\x1f]' -or $Relative.StartsWith('/') -or @($Relative.Split('/') | Where-Object { $_ -in @('','..','.') }).Count) { throw ('不支持的相对路径：' + $Relative) }
    $full = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (!(Test-Within $full $Root)) { throw '路径越界。' }
    return $full
}
function Assert-NoLinks([string]$Path) {
    $cursor = $Path
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw ('不支持符号链接或目录联接：' + $cursor) }
        }
        $next = Split-Path -Parent $cursor
        if ($next -eq $cursor) { break }; $cursor = $next
    }
}
function Read-JsonFile([string]$Path) { if (Test-Path -LiteralPath $Path -PathType Leaf) { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }; return $null }
function Hash-Bytes([byte[]]$Bytes) { $hash=[Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose() } }
function Hash-File([string]$Path) { if (Test-Path -LiteralPath $Path -PathType Leaf) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }; return $null }
function Write-Atomic([string]$Path,[byte[]]$Bytes) {
    $null=[IO.Directory]::CreateDirectory((Split-Path -Parent $Path)); $temp=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp';$prior=$temp+'.previous'
    try { [IO.File]::WriteAllBytes($temp,$Bytes); if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temp,$Path,$prior) } else { [IO.File]::Move($temp,$Path) } }
    finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) };if ([IO.File]::Exists($prior)) { [IO.File]::Delete($prior) } }
}
function Save-Json([string]$Path,$Value) { Write-Atomic $Path ([Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 20)+"`n")) }
