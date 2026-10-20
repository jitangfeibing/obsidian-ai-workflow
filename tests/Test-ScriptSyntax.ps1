#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$failed = $false
foreach ($file in Get-ChildItem -LiteralPath $root -Filter '*.ps1' -Recurse) {
    $tokens = $null
    $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($null -ne $errors -and $errors.Count -gt 0) {
        $failed = $true
        foreach ($error in $errors) { Write-Host ($file.Name + ': ' + $error.Message) }
    } else { Write-Host ('PASS ' + $file.Name) }
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    if ($bytes.Length -lt 3 -or $bytes[0] -ne 239 -or $bytes[1] -ne 187 -or $bytes[2] -ne 191) {
        $failed = $true
        Write-Host ('FAIL UTF-8 BOM missing: ' + $file.Name)
    }
}
if ($failed) { exit 1 }
Write-Host 'Syntax checked only. No installer or runtime was executed.'
