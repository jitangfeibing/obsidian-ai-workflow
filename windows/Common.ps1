#requires -Version 5.1
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$script:AppRoot = Join-Path $env:LOCALAPPDATA 'ObsidianTunnel'
$script:ConfigPath = Join-Path $script:AppRoot 'settings.json'
$script:SecretsPath = Join-Path $script:AppRoot 'keys.xml'
$script:StatePath = Join-Path $script:AppRoot 'state.json'
$script:StopPath = Join-Path $script:AppRoot 'stop.requested'
$script:LogPath = Join-Path $script:AppRoot 'runtime.log'
$script:StartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'ObsidianTunnel.lnk'
$script:UserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$script:TaskName = 'ObsidianTunnel-' + $script:UserSid
$script:Redactions = @()
$script:SessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId

function Assert-Windows {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'This package requires Windows. Keys must be encrypted on Windows.'
    }
}

function Protect-AppFolder {
    New-Item -ItemType Directory -Path $script:AppRoot -Force | Out-Null
    # Read and persist DACL access rules only. A fresh descriptor passed to Set-Acl
    # can attempt to apply audit/owner sections and require SeSecurityPrivilege.
    $acl = [IO.Directory]::GetAccessControl(
        $script:AppRoot, [Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]))) {
        $acl.RemoveAccessRuleSpecific($rule)
    }
    foreach ($id in @($script:UserSid, 'S-1-5-18')) {
        $identity = New-Object Security.Principal.SecurityIdentifier($id)
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $identity, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    [IO.Directory]::SetAccessControl($script:AppRoot, $acl)
}

function Read-Config {
    if (-not (Test-Path -LiteralPath $script:ConfigPath)) {
        throw '尚未安装。请先运行 01-Install.cmd。'
    }
    return (Get-Content -LiteralPath $script:ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Convert-SecretToText([Security.SecureString]$Secret) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Read-Keys {
    $saved = Import-Clixml -LiteralPath $script:SecretsPath
    if ($saved.ControlPlane -isnot [Security.SecureString] -or
        $saved.Obsidian -isnot [Security.SecureString]) {
        throw '密钥文件格式不正确，请运行 05-UpdateKeys.cmd。'
    }
    return [pscustomobject]@{
        ControlPlane = (Convert-SecretToText $saved.ControlPlane)
        Obsidian = (Convert-SecretToText $saved.Obsidian)
    }
}

function Read-ClipboardKey([string]$Prompt, [switch]$StripBearer) {
    Read-Host $Prompt | Out-Null
    $value = ([string](Get-Clipboard -Raw)).Trim()
    if ($StripBearer) { $value = $value -replace '^Bearer\s+', '' }
    if ([string]::IsNullOrWhiteSpace($value) -or $value -match '\s') {
        throw '剪贴板内容不是单独的密钥。请重新复制密钥，再运行安装程序。'
    }
    return $value
}

function Get-LocalJson([string]$Url, [string]$Authorization = '') {
    $request = [Net.HttpWebRequest]::Create($Url)
    $request.Proxy = $null
    $request.Timeout = 2500
    $request.ReadWriteTimeout = 2500
    if ($Authorization) { $request.Headers['Authorization'] = $Authorization }
    $response = $null
    $reader = $null
    try {
        $response = $request.GetResponse()
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        return ($reader.ReadToEnd() | ConvertFrom-Json)
    } finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $response) { $response.Dispose() }
    }
}

function Test-Obsidian([string]$Url, [string]$Key) {
    try {
        $status = Get-LocalJson ([uri]$Url).GetLeftPart([UriPartial]::Authority) ('Bearer ' + $Key)
        return ($status.authenticated -eq $true)
    } catch { return $false }
}

function Save-Keys([string]$McpUrl) {
    $runtimeKey = Read-ClipboardKey '现在复制 OpenAI Runtime API Key，复制后回来按回车'
    $obsidianKey = Read-ClipboardKey '现在复制 Obsidian 插件 API Key，复制后回来按回车' -StripBearer
    if (-not (Test-Obsidian $McpUrl $obsidianKey)) {
        throw 'Obsidian 验证失败。请打开正确的库、启用 HTTP 27123，并确认复制的是这个库的插件密钥。旧密钥文件不会被覆盖。'
    }
    $encrypted = [pscustomobject]@{
        ControlPlane = (ConvertTo-SecureString -String $runtimeKey -AsPlainText -Force)
        Obsidian = (ConvertTo-SecureString -String $obsidianKey -AsPlainText -Force)
    }
    $temporary = $script:SecretsPath + '.new'
    $encrypted | Export-Clixml -LiteralPath $temporary -Depth 4
    $roundTrip = Import-Clixml -LiteralPath $temporary
    if ((Convert-SecretToText $roundTrip.ControlPlane) -cne $runtimeKey -or
        (Convert-SecretToText $roundTrip.Obsidian) -cne $obsidianKey) {
        Remove-Item -LiteralPath $temporary -Force
        throw '本机密钥加密回读失败，安装已停止。'
    }
    Move-Item -LiteralPath $temporary -Destination $script:SecretsPath -Force
    Set-Clipboard -Value '' -ErrorAction SilentlyContinue
    $runtimeKey = $null
    $obsidianKey = $null
    Write-Host '两种密钥已在本机加密保存，Obsidian 验证通过。' -ForegroundColor Green
}

function Test-ProxyPort([string]$ProxyUrl) {
    if (-not $ProxyUrl) { return $true }
    $proxyAddress = [uri]$ProxyUrl
    $tcp = New-Object Net.Sockets.TcpClient
    $pending = $null
    try {
        $pending = $tcp.BeginConnect($proxyAddress.Host, $proxyAddress.Port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(1000)) { return $false }
        $tcp.EndConnect($pending)
        return $tcp.Connected
    } catch { return $false }
    finally {
        if ($null -ne $pending) { $pending.AsyncWaitHandle.Close() }
        $tcp.Dispose()
    }
}

function Find-RunningApp([string[]]$Names) {
    foreach ($name in $Names) {
        foreach ($process in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
            if ($process.SessionId -ne $script:SessionId) { continue }
            try { if ($process.Path) { return $process.Path } } catch { }
        }
    }
    return ''
}

function Start-Companions($Config) {
    foreach ($path in @($Config.ObsidianExe, $Config.ClashExe)) {
        if (-not $path -or -not (Test-Path -LiteralPath $path)) { continue }
        $name = [IO.Path]::GetFileNameWithoutExtension($path)
        $running = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $script:SessionId })
        if ($running.Count -eq 0) {
            try { Start-Process -FilePath $path | Out-Null }
            catch { Write-RuntimeLog ('无法启动配套应用：' + $name) }
        }
    }
}

function Write-RuntimeLog([string]$Message) {
    foreach ($secret in $script:Redactions) {
        if ($secret) { $Message = $Message.Replace($secret, '[REDACTED]') }
    }
    if ((Test-Path -LiteralPath $script:LogPath) -and
        (Get-Item -LiteralPath $script:LogPath).Length -gt (5 * 1024 * 1024)) {
        $oldest = $script:LogPath + '.3'
        if (Test-Path -LiteralPath $oldest) { Remove-Item -LiteralPath $oldest -Force }
        for ($i = 2; $i -ge 1; $i--) {
            $source = $script:LogPath + '.' + $i
            if (Test-Path -LiteralPath $source) {
                Move-Item -LiteralPath $source -Destination ($script:LogPath + '.' + ($i + 1)) -Force
            }
        }
        Move-Item -LiteralPath $script:LogPath -Destination ($script:LogPath + '.1') -Force
    }
    Add-Content -LiteralPath $script:LogPath -Encoding UTF8 -Value (
        '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

function Write-State([string]$Phase, $Child = $null) {
    $runner = Get-Process -Id $PID
    $state = [ordered]@{
        Phase = $Phase
        UpdatedAt = (Get-Date).ToString('o')
        SupervisorPid = $PID
        SupervisorStartTicks = $runner.StartTime.ToUniversalTime().Ticks.ToString()
        ChildPid = $null
        ChildStartTicks = $null
    }
    if ($null -ne $Child) {
        try {
            $state.ChildPid = $Child.Id
            $state.ChildStartTicks = $Child.StartTime.ToUniversalTime().Ticks.ToString()
        } catch { }
    }
    $temporary = $script:StatePath + '.new'
    $state | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $script:StatePath -Force
}

function Read-State {
    try { return (Get-Content -LiteralPath $script:StatePath -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { return $null }
}

function Get-VerifiedProcess($ProcessId, [string]$StartTicks, [string]$ExePath = '') {
    if (-not $ProcessId -or -not $StartTicks) { return $null }
    try {
        $process = Get-Process -Id ([int]$ProcessId) -ErrorAction Stop
        if ($process.StartTime.ToUniversalTime().Ticks.ToString() -cne $StartTicks) { return $null }
        if ($ExePath -and -not [string]::Equals($process.Path, $ExePath, [StringComparison]::OrdinalIgnoreCase)) {
            return $null
        }
        return $process
    } catch { return $null }
}

function Wait-Retry([int]$Seconds) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Test-Path -LiteralPath $script:StopPath) { return $false }
        Start-Sleep -Seconds 1
    }
    return $true
}

function Start-Background {
    Remove-Item -LiteralPath $script:StopPath -Force -ErrorAction SilentlyContinue
    $config = Read-Config
    if ($config.StartupMode -eq 'ScheduledTask') {
        Start-ScheduledTask -TaskName $script:TaskName -ErrorAction Stop
    } else {
        $powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $runnerPath = Join-Path $script:AppRoot 'Runner.ps1'
        Start-Process -FilePath $powershellExe -WindowStyle Hidden -ArgumentList (
            '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $runnerPath) | Out-Null
    }
}

function Stop-Background {
    Set-Content -LiteralPath $script:StopPath -Value 'stop' -Encoding ASCII
    $state = Read-State
    # Allow the supervisor to close its own child first, including startup races.
    if ($null -ne $state) {
        for ($attempt = 0; $attempt -lt 24; $attempt++) {
            $alive = Get-VerifiedProcess $state.SupervisorPid $state.SupervisorStartTicks
            if ($null -eq $alive) { break }
            Start-Sleep -Milliseconds 250
        }
        $latest = Read-State
        if ($null -ne $latest) { $state = $latest }
    }
    if ($null -ne $state) {
        $config = Read-Config
        $child = Get-VerifiedProcess $state.ChildPid $state.ChildStartTicks $config.ClientExe
        if ($null -ne $child) { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue }
    }
    $task = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
    if ($null -ne $task) { Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue }
    if ($null -ne $state) {
        $supervisor = Get-VerifiedProcess $state.SupervisorPid $state.SupervisorStartTicks
        if ($null -ne $supervisor) {
            $details = Get-CimInstance Win32_Process -Filter ('ProcessId = {0}' -f $supervisor.Id)
            $runnerPath = Join-Path $script:AppRoot 'Runner.ps1'
            if ($null -ne $details -and $details.CommandLine -and $details.CommandLine.IndexOf($runnerPath, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Stop-Process -Id $supervisor.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
