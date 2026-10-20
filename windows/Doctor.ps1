#requires -Version 5.1
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Windows
$config=Read-Config;Assert-ClientOptions $config
$keys=Read-Keys
$variables=@{CONTROL_PLANE_API_KEY=$keys.ControlPlane;OBSIDIAN_AUTH=('Bearer '+$keys.Obsidian);MCP_EXTRA_HEADERS='Authorization: env:OBSIDIAN_AUTH';MCP_DISCOVERY_EXTRA_HEADERS='Authorization: env:OBSIDIAN_AUTH';NO_PROXY='localhost,127.0.0.1,::1';HTTPS_PROXY=$config.ProxyUrl;HTTP_PROXY=$config.ProxyUrl}
$prior=@{};$code=1
try {
    foreach ($name in $variables.Keys) { $prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$variables[$name],'Process') }
    $lines=@(& $config.ClientExe doctor --profile $config.Profile --explain 2>&1);$code=$LASTEXITCODE
    foreach ($line in $lines) { Write-Host ([string]$line).Replace($keys.ControlPlane,'[REDACTED]').Replace($keys.Obsidian,'[REDACTED]') }
} finally {
    foreach ($name in $prior.Keys) { [Environment]::SetEnvironmentVariable($name,$prior[$name],'Process') }
    $keys=$null;$variables.Clear()
}
exit $code
