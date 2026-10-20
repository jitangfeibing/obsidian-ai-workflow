param([string]$WorkPath)
. (Join-Path $PSScriptRoot '../Core.ps1')
if (!$WorkPath -or ((Test-Path -LiteralPath $WorkPath) -and @(Get-ChildItem -LiteralPath $WorkPath -Force).Count)) { throw '测试仅接受全新或空的 WorkPath，不能指向真实库。' }
$null=[IO.Directory]::CreateDirectory($WorkPath)
function Assert([bool]$Value, [string]$Message) { if (!$Value) { throw ('ASSERT: ' + $Message) } }
function Put([string]$Relative, [string]$Text) { $p=Join-Path $vault $Relative; $null=[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p)); [IO.File]::WriteAllText($p,$Text,(New-Object Text.UTF8Encoding($false))) }
$vault=Join-Path $WorkPath '测试库';$dest=Join-Path $WorkPath '备份';$restores=Join-Path $WorkPath '恢复';$null=[IO.Directory]::CreateDirectory($restores)
Put 'personal-system-starter/00_首页.md' "---`ntype: dashboard`n---`n中文 [[链接]]`n"
Put 'personal-system-starter/04_学习/Agent/第一章.md' "---`ntype: learning`nmastery: 未验收`nnext_review:`n---`n原始回答`n``````python`nprint('keep')`n```````n"
Put 'personal-system-starter/90_视图/学习.base' 'KEEP BASE'
Put '附件/图像.bin' 'BINARY PLACEHOLDER'
[IO.File]::WriteAllBytes((Join-Path $vault '附件/图像.bin'), [byte[]](0..255))
Put '未命名.md' 'ROOT NOTE KEEP'
Put '.obsidian/app.json' '{"keep":true}'
Put '.obsidian/plugins/personal-project-pages/main.js' 'PLUGIN CODE'
Put '.obsidian/plugins/personal-project-pages/manifest.json' '{"id":"personal-project-pages"}'
Put '.obsidian/plugins/personal-project-pages/assets/forest.png' 'IMAGE'
Put '.obsidian/plugins/obsidian-local-rest-api/data.json' '{"apiKey":"SECRET_SENTINEL"}'
Put '.obsidian/plugins/personal-project-pages/data.json' '{"draft":"not included"}'
Put '.obsidian/snippets/workspace.css' 'CSS KEEP'
Put '.obsidian/workspace.json' 'OMIT SESSION'
Put '.env' 'SECRET_SENTINEL'
Put '.git/config' 'OMIT GIT'
Put '.trash/deleted.md' 'OMIT TRASH'
Put 'Obsidian-Home-Workspace/文档/副本.md' 'OMIT INSTALL COPY'
$config=[pscustomobject]@{format=1;vaultId=[guid]::NewGuid().ToString('N');vaultPath=$vault;backupPath=$dest;autoMode='Disabled'}
$initial=Get-VaultInventory $vault
Assert ($initial.files.Count -eq 10) ('allowed file count: '+$initial.files.Count)
Assert ($initial.excluded.Count -ge 6) 'policy exclusion count'
$first=Invoke-VaultBackup $config
Assert ($first.state -eq 'created') 'first backup'
$zip=Join-Path $dest $first.name;$manifest=Test-Snapshot $zip
Assert (@($manifest.files).Count -eq 10) 'verified manifest count'
$same=Invoke-VaultBackup $config;Assert ($same.state -eq 'unchanged') 'unchanged does not duplicate'
Put 'personal-system-starter/04_学习/Agent/第一章.md' 'NEW CONTENT'
[IO.File]::Delete((Join-Path $vault '未命名.md'))
$second=Invoke-VaultBackup $config;Assert ($second.state -eq 'created') 'change and deletion make version'
Assert ($first.name -ne $second.name) 'immutable version names'
$restored=Restore-Snapshot $zip $restores $vault $dest
Assert ([IO.File]::ReadAllText((Join-Path $restored '未命名.md')) -eq 'ROOT NOTE KEEP') 'deleted file recovered'
Assert ([IO.File]::ReadAllText((Join-Path $restored 'personal-system-starter/04_学习/Agent/第一章.md')).Contains('原始回答')) 'original evidence recovered'
Assert ([IO.File]::ReadAllText((Join-Path $vault 'personal-system-starter/04_学习/Agent/第一章.md')) -eq 'NEW CONTENT') 'restore does not overwrite current vault'
Assert (![IO.File]::Exists((Join-Path $restored '.obsidian/plugins/obsidian-local-rest-api/data.json'))) 'credentials excluded'
Assert ([IO.File]::ReadAllText((Join-Path $restored '.obsidian/plugins/personal-project-pages/main.js')) -eq 'PLUGIN CODE') 'plugin code recovered'
Assert ([IO.File]::ReadAllText((Join-Path $restored '.obsidian/snippets/workspace.css')) -eq 'CSS KEEP') 'style recovered'
$bad=Join-Path $dest 'bad.zip';[IO.File]::Copy($zip,$bad)
$archive=[IO.Compression.ZipFile]::Open($bad,[IO.Compression.ZipArchiveMode]::Update)
try {$entry=$archive.GetEntry('vault/未命名.md');$entry.Delete();$entry=$archive.CreateEntry('vault/未命名.md');$writer=New-Object IO.StreamWriter($entry.Open(),(New-Object Text.UTF8Encoding($false)));try{$writer.Write('ROOT NOTE FAIL')}finally{$writer.Dispose()}}finally{$archive.Dispose()}
$rejected=$false;try{$null=Restore-Snapshot $bad $restores $vault $dest}catch{$rejected=$true};Assert $rejected 'corrupt ZIP refused'
$bad2=Join-Path $dest 'traversal.zip';[IO.File]::Copy($zip,$bad2);$archive=[IO.Compression.ZipFile]::Open($bad2,[IO.Compression.ZipArchiveMode]::Update)
try {$null=$archive.CreateEntry('vault/../../outside.md')}finally{$archive.Dispose()}
$rejected=$false;try{$null=Restore-Snapshot $bad2 $restores $vault $dest}catch{$rejected=$true};Assert $rejected 'extra and traversal entry refused'
$rejected=$false;try{Assert-Separate $vault (Join-Path $vault 'backup')}catch{$rejected=$true};Assert $rejected 'recursive backup refused'
$rejected=$false;try{$null=Restore-Snapshot $zip $vault $vault $dest}catch{$rejected=$true};Assert $rejected 'restore into live vault refused'
$locked=[IO.File]::Open((Join-Path $dest '.backup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {$rejected=$false;try{$null=Invoke-VaultBackup $config}catch{$rejected=$true};Assert $rejected 'concurrent run refused'}finally{$locked.Dispose()}
# A malformed pointer must not destroy old versions or prevent making a new good version.
[IO.File]::WriteAllText((Join-Path $dest 'latest.json'),'{}')
$repaired=Invoke-VaultBackup $config;Assert ($repaired.state -eq 'created') 'malformed pointer repaired';Assert ([IO.File]::Exists($zip)) 'old version remains'
$badSidecar=Join-Path $dest ($repaired.name+'.json');$sidecar=Read-Json $badSidecar;$sidecar.zipSha256=('0'*64);Write-JsonAtomic $badSidecar $sidecar
$fresh=Invoke-VaultBackup $config;Assert ($fresh.state -eq 'created') 'damaged sidecar makes a fresh good version'
$held=[IO.File]::Open((Join-Path $vault 'personal-system-starter/00_首页.md'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {$rejected=$false;try{$null=Invoke-VaultBackup $config}catch{$rejected=$true};Assert $rejected 'locked source refused';Assert ([IO.File]::Exists($zip)) 'good old version survives source failure'}finally{$held.Dispose()}
foreach($unsafe in @('../outside.md','/absolute.md','a/../b.md','a\b.md','a:stream','CON.md','x/aux.txt','x./a.md')) {Assert (!(Test-RelativeName $unsafe)) ('unsafe name rejected: '+$unsafe)}
Write-Host 'PASS: real ZIP backup/unchanged/change/deletion, binary and Chinese paths, original evidence, safe configuration, credential exclusions, independent restore, corruption/traversal refusal, recursion and concurrent-run checks.'
