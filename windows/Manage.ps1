#requires -Version 5.1
param([ValidateSet('Start', 'Stop', 'Status', 'Logs', 'Uninstall')][string]$Action = 'Status')
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Windows
$config = Read-Config
switch ($Action) {
    'Start' {
        Start-Background
        Write-Host '后台启动已提交。稍等后运行 02-Status.cmd 查看连接状态。'
    }
    'Stop' {
        Stop-Background
        Write-Host '已停止本启动包的后台程序。下次登录会自动启动，也可以运行 03-Start.cmd。'
    }
    'Logs' {
        if (Test-Path -LiteralPath $script:LogPath) {
            Start-Process notepad.exe -ArgumentList ('"{0}"' -f $script:LogPath)
        } else { Write-Host '日志尚未生成。' }
    }
    'Status' {
        Write-Host ('登录启动方式：' + $config.StartupMode)
        $state = Read-State
        $supervisor = $null
        $child = $null
        if ($null -ne $state) {
            $supervisor = Get-VerifiedProcess $state.SupervisorPid $state.SupervisorStartTicks
            $child = Get-VerifiedProcess $state.ChildPid $state.ChildStartTicks $config.ClientExe
        }
        if ($null -ne $supervisor) {
            Write-Host ('守护程序：运行中；状态=' + $state.Phase)
        } else { Write-Host '守护程序：未运行。可运行 03-Start.cmd。' -ForegroundColor Yellow }
        if ($null -ne $child) {
            Write-Host ('隧道进程：运行中；PID=' + $child.Id)
            Write-Host ('当前内存：{0:N1} MB' -f ($child.WorkingSet64 / 1048576))
        } else { Write-Host '隧道进程：未运行或正在等待 Obsidian / Clash。' -ForegroundColor Yellow }
        try {
            $keys = Read-Keys
            if (Test-Obsidian $config.McpUrl $keys.Obsidian) {
                Write-Host 'Obsidian 本地接口：认证通过' -ForegroundColor Green
            } else { Write-Host 'Obsidian 本地接口：未就绪或密钥不匹配' -ForegroundColor Yellow }
            $keys = $null
        } catch { Write-Host '密钥无法解密，请在原 Windows 账户下运行，或更新密钥。' -ForegroundColor Yellow }
        Write-Host ('代理配置：' + $(if ($config.ProxyUrl) { $config.ProxyUrl } else { '直连' }))
        Write-Host ('代理检查通过：' + (Test-ProxyPort $config.ProxyUrl))
        if ($null -ne $child) {
            try {
                $health = Get-LocalJson ('http://' + (Get-HealthAddress $config) + '/health')
                Write-Host ('客户端存活：' + $health.live + '；就绪：' + $health.ready)
                $control = Get-LocalJson ('http://' + (Get-HealthAddress $config) + '/health/control-plane')
                Write-Host ('OpenAI 控制连接：' + $control.status + ' / ' + $control.state)
                if ($control.status -eq 'ok') {
                    Write-Host '已观察到正常控制连接。最后仍以 ChatGPT 实际读取笔记为准。' -ForegroundColor Green
                } else { Write-Host '控制连接尚未确认正常，请查看日志；可能是密钥、网络或代理问题。' -ForegroundColor Yellow }
            } catch { Write-Host '尚未读取到健康信息，请稍等或查看日志。' -ForegroundColor Yellow }
        }
        Write-Host ('日志：' + $script:LogPath)
        if (Test-Path -LiteralPath $script:LogPath) {
            Write-Host '最近日志：'
            Get-Content -LiteralPath $script:LogPath -Encoding UTF8 -Tail 8 | ForEach-Object { Write-Host $_ }
        }
    }
    'Uninstall' {
        Stop-Background
        $task = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
        if ($null -ne $task) { Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false }
        Remove-Item -LiteralPath $script:StartupLink -Force -ErrorAction SilentlyContinue
        foreach ($name in @('Obsidian Tunnel - Status.lnk', 'Obsidian Tunnel - Start.lnk')) {
            Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) $name) -Force -ErrorAction SilentlyContinue
        }
        # Remove only the encrypted keys and this package's settings; keep scripts and logs for review.
        foreach ($path in @($script:SecretsPath, ($script:SecretsPath + '.new'), $script:ConfigPath, $script:StatePath, $script:StopPath)) {
            Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        }
        Write-Host '已取消登录启动并删除本启动包保存的密钥。Obsidian 库和原隧道配置保留，配套应用保持打开。'
    }
}
