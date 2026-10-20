#requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'windows/Client.Options.ps1')
function Check($Condition,[string]$Message) { if (!$Condition) { throw $Message } }
$c=[pscustomobject]@{Profile='my-notes';McpUrl='http://127.0.0.1:29000/mcp/';ProxyUrl='';HealthListenAddr='127.0.0.1:8081'}
$argsText=Get-ClientArguments $c
Check ($argsText -eq 'run --profile my-notes --health.listen-addr 127.0.0.1:8081') 'Direct configuration failed'
$c.ProxyUrl='http://127.0.0.1:9080'
Check ((Get-ClientArguments $c).EndsWith('--control-plane.http-proxy http://127.0.0.1:9080')) 'Custom proxy ignored'
$old=[pscustomobject]@{Profile='obsidian';McpUrl='http://127.0.0.1:27123/mcp/';ProxyUrl=''}
Check ((Get-HealthAddress $old) -eq '127.0.0.1:8080') 'Old configuration compatibility failed'
foreach ($pair in @(@('Profile','bad --profile injected'),@('ProxyUrl','http://user:password@127.0.0.1:9080'),@('HealthListenAddr','0.0.0.0:8080'),@('HealthListenAddr','127.0.0.1:65536'))) {
    $copy=[pscustomobject]@{Profile='good';McpUrl=$c.McpUrl;ProxyUrl='';HealthListenAddr='127.0.0.1:8080'}
    $copy.($pair[0])=$pair[1];$rejected=$false
    try { $null=Get-ClientArguments $copy } catch { $rejected=$true }
    Check $rejected ('Invalid option accepted: '+$pair[0])
}
Write-Host 'PASS configurable profile/proxy/health, direct mode, legacy config and option validation'
