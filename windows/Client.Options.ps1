#requires -Version 5.1
function Assert-ClientOptions($Config) {
    if ($Config.Profile -notmatch '^[a-zA-Z0-9_-]{1,64}$') { throw 'Profile 只能包含字母、数字、下划线和连字符。' }
    $address = Get-HealthAddress $Config
    if ($address -notmatch '^127\.0\.0\.1:([1-9][0-9]{0,4})$' -or [int]$Matches[1] -gt 65535) { throw 'HealthListenAddr 必须是 127.0.0.1:有效端口。' }
    foreach ($url in @($Config.McpUrl,$Config.ProxyUrl)) {
        if (!$url) { continue }
        $parsed = $null
        if ($url -match '[\s"\x00-\x1f]' -or ![Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$parsed) -or $parsed.Scheme -notin @('http','https') -or $parsed.UserInfo) { throw 'URL 必须是无内嵌凭证的 HTTP(S) 地址。' }
    }
}
function Get-HealthAddress($Config) {
    if ($Config.PSObject.Properties['HealthListenAddr'] -and $Config.HealthListenAddr) { return [string]$Config.HealthListenAddr }
    return '127.0.0.1:8080'
}
function Get-ClientArguments($Config) {
    Assert-ClientOptions $Config
    $result = 'run --profile ' + $Config.Profile + ' --health.listen-addr ' + (Get-HealthAddress $Config)
    if ($Config.ProxyUrl) { $result += ' --control-plane.http-proxy ' + $Config.ProxyUrl }
    return $result
}
