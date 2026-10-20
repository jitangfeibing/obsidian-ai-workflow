#requires -Version 5.1
param([ValidateSet('Status','Disable','Enable')][string]$Action = 'Status')
. (Join-Path $PSScriptRoot 'Windows.ps1')
try {
    Assert-Windows; $toolRoot = Get-ToolRoot; $configPath = Join-Path $toolRoot 'settings.json'; $config = Read-Config $configPath
    $taskName = Get-TaskName $config; $startup = Get-StartupLink $config
    if ($Action -eq 'Disable') {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) { $null = Disable-ScheduledTask -TaskName $taskName }
        if ([IO.File]::Exists($startup)) { [IO.File]::Delete($startup) }
        $config.autoMode = 'Disabled'; Write-JsonAtomic $configPath $config
        Write-Host '已暂停自动备份；当前正在执行的备份可自然结束，已有版本和手动备份保留。' -ForegroundColor Green
        exit 0
    }
    if ($Action -eq 'Enable') { $config.autoMode = Enable-AutoBackup $config $toolRoot; Write-JsonAtomic $configPath $config; Write-Host ('已启用：' + $config.autoMode); exit 0 }
    Write-Host ('库：' + $config.vaultPath); Write-Host ('备份目录：' + $config.backupPath); Write-Host ('保存的自动方式：' + $config.autoMode)
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) { Write-Host ('实际任务状态：' + $task.State); $info = Get-ScheduledTaskInfo -TaskName $taskName; Write-Host ('下次计划：' + $info.NextRunTime + '；上次退出码：' + $info.LastTaskResult) }
    else { Write-Host ('登录启动入口：' + [IO.File]::Exists($startup)) }
    $statePath = Join-Path $toolRoot 'last-run.json'
    if (Test-Path -LiteralPath $statePath) { $state = Read-Json $statePath; Write-Host ('最近检查：' + $state.checkedAt + '；结果：' + $state.state); if ($state.state -eq 'failed') { Write-Host $state.error -ForegroundColor Red } }
    $latestPath = Join-Path $config.backupPath 'latest.json'
    if (!(Test-Path -LiteralPath $latestPath)) { Write-Host '尚无已发布版本。' -ForegroundColor Yellow; exit 0 }
    $latest = Read-Json $latestPath
    if ($latest.name -notmatch '^backup-\d{8}-\d{6}-[a-f0-9]{8}\.zip$') { throw '最新版本索引异常。' }
    $zip = Join-Path $config.backupPath $latest.name
    if ((Get-FileHashSafe $zip) -ne $latest.zipSha256) { throw '最新 ZIP 校验失败，请立即重新备份。' }
    $manifest = Test-Snapshot $zip
    Write-Host ('最新有效版本：' + $latest.name + '；时间：' + $latest.createdAt) -ForegroundColor Green
    Write-Host ('文件：' + @($manifest.files).Count + '；排除项：' + @($manifest.excluded).Count)
    $versions = @(Get-ChildItem -LiteralPath $config.backupPath -Filter 'backup-*.zip' -File)
    $total = ($versions | Measure-Object -Property Length -Sum).Sum
    Write-Host ('版本数：' + $versions.Count + '；ZIP 总占用：' + [math]::Round($total / 1MB, 2) + ' MB；旧版本不自动清理。')
} catch { Write-Host ('操作未完成：' + $_.Exception.Message) -ForegroundColor Red; exit 1 }
