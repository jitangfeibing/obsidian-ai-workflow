#requires -Version 5.1
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $repo 'setup/System.Common.ps1')
function Check($Condition,[string]$Message) { if (!$Condition) { throw $Message } }
function Reject([scriptblock]$Action,[string]$Message) { $bad=$false;try { &$Action | Out-Null } catch { $bad=$true };Check $bad $Message }
$temp=Join-Path ([IO.Path]::GetTempPath()) ('obsidian-system-test-'+[guid]::NewGuid().ToString('N'))
$null=[IO.Directory]::CreateDirectory($temp)
try {
    $vault=Join-Path $temp '个人库'
    $plan=& (Join-Path $repo 'setup/Install-System.ps1') -VaultPath $vault -Plan | ConvertFrom-Json
    Check (!(Test-Path -LiteralPath $vault)) 'Plan mutated the filesystem'
    Check ($plan.conflicts -eq 0) 'Fresh plan has conflicts'
    $installed=& (Join-Path $repo 'setup/Install-System.ps1') -VaultPath $vault | ConvertFrom-Json
    Check ($installed.conflicts -eq 0) 'Fresh install incomplete'
    $homePagePath=Join-Safe $vault 'personal-system-starter/00_首页.md'
    Check (Test-Path -LiteralPath $homePagePath) 'Home missing'
    Check (@((Read-JsonFile (Join-Safe $vault '.obsidian/community-plugins.json'))).Count -eq 2) 'Plugins not enabled'
    $note=Join-Safe $vault 'personal-system-starter/03_目标与项目/项目/用户笔记.md'
    Write-Atomic $note ([Text.Encoding]::UTF8.GetBytes("用户内容`n"))
    $data=Join-Safe $vault '.obsidian/plugins/personal-project-pages/data.json';Save-Json $data @{root='personal-system-starter';homeDraft='保留草稿'}
    $noteHash=Hash-File $note;$dataHash=Hash-File $data
    Save-Json (Join-Safe $vault '.obsidian/community-plugins.json') @('personal-project-pages','personal-system-tools','other-plugin')
    $again=& (Join-Path $repo 'setup/Install-System.ps1') -VaultPath $vault | ConvertFrom-Json
    Check (@($again.operations | Where-Object action -ne 'Unchanged').Count -eq 0) 'Repeated install changed managed files'
    Check ((Hash-File $note) -eq $noteHash -and (Hash-File $data) -eq $dataHash) 'User content/settings overwritten'
    Check (@(Read-JsonFile (Join-Safe $vault '.obsidian/community-plugins.json')) -contains 'other-plugin') 'Other plugin lost'
    Write-Atomic $homePagePath ([Text.Encoding]::UTF8.GetBytes('用户自改首页'))
    $homeHash=Hash-File $homePagePath
    $conflict=& (Join-Path $repo 'setup/Install-System.ps1') -VaultPath $vault | ConvertFrom-Json
    Check ($conflict.conflicts -eq 1 -and (Hash-File $homePagePath) -eq $homeHash) 'Edited page was replaced'
    # Make a future release fixture outside the real repository.
    $package=Join-Path $temp 'next-release';$null=[IO.Directory]::CreateDirectory($package)
    foreach ($folder in @('setup','vault-template','plugins')) { Copy-Item -LiteralPath (Join-Path $repo $folder) -Destination $package -Recurse }
    Copy-Item -LiteralPath (Join-Path $repo 'release.json') -Destination $package
    $release=Read-JsonFile (Join-Path $package 'release.json')
    $entry=@($release.files | Where-Object destination -eq 'personal-system-starter/04_学习/学习中心.md')[0]
    $fixture=Join-Safe $package $entry.source
    [IO.File]::AppendAllText($fixture,"`n新版本入口`n",[Text.Encoding]::UTF8)
    $entry.sha256=Hash-File $fixture;Save-Json (Join-Path $package 'release.json') $release
    $study=Join-Safe $vault $entry.destination;$studyBefore=Hash-File $study
    $upgrade=& (Join-Path $package 'setup/Install-System.ps1') -VaultPath $vault | ConvertFrom-Json
    Check ((Hash-File $study) -eq $entry.sha256) 'Managed upgrade failed'
    $studyAfter=[IO.File]::ReadAllBytes($study)
    [IO.File]::AppendAllText($study,'用户新修改',[Text.Encoding]::UTF8)
    Reject { & (Join-Path $package 'setup/Restore-System.ps1') -ManifestPath $upgrade.backup } 'Restore overwrote post-install changes'
    Write-Atomic $study $studyAfter
    $restored=& (Join-Path $package 'setup/Restore-System.ps1') -ManifestPath $upgrade.backup | ConvertFrom-Json
    Check ($restored.restored -and (Hash-File $study) -eq $studyBefore) 'Rollback failed'
    Check ((Hash-File $note) -eq $noteHash -and (Hash-File $data) -eq $dataHash -and (Hash-File $homePagePath) -eq $homeHash) 'Rollback damaged user files'
    $manifest=Join-Safe $vault '.obsidian/plugins/personal-project-pages/manifest.json'
    $newer=Read-JsonFile $manifest;$newer.version='99.0.0';Save-Json $manifest $newer
    $newerHash=Hash-File $manifest
    $downgrade=& (Join-Path $repo 'setup/Install-System.ps1') -VaultPath $vault | ConvertFrom-Json
    Check ($downgrade.conflicts -gt 1 -and (Hash-File $manifest) -eq $newerHash) 'Newer plugin downgraded'
    $entry.destination='../escaped.md';Save-Json (Join-Path $package 'release.json') $release
    Reject { & (Join-Path $package 'setup/Install-System.ps1') -VaultPath (Join-Path $temp 'untouched') -Plan } 'Traversal accepted'
    Check (!(Test-Path -LiteralPath (Join-Path $temp 'untouched'))) 'Failed plan mutated destination'
    Write-Host 'PASS fresh/plan/reinstall, managed upgrade, user edits and data protection, rollback conflicts, newer plugin and path guards'
} finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force } }
