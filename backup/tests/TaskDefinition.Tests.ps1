. (Join-Path $PSScriptRoot '../Windows.ps1')
function New-ScheduledTaskAction {param($Execute,$Argument,$WorkingDirectory) return [pscustomobject]@{exe=$Execute; args=$Argument; cwd=$WorkingDirectory}}
function New-ScheduledTaskTrigger {param([switch]$AtLogOn,$User,[switch]$Daily,$At) return [pscustomobject]@{login=[bool]$AtLogOn;user=$User;daily=[bool]$Daily;at=$At;Delay=''}}
function New-ScheduledTaskPrincipal {param($UserId,$LogonType,$RunLevel) return [pscustomobject]@{user=$UserId;logon=$LogonType;level=$RunLevel}}
function New-ScheduledTaskSettingsSet {param($MultipleInstances,[switch]$StartWhenAvailable,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,$ExecutionTimeLimit) return [pscustomobject]@{instances=$MultipleInstances;catchup=[bool]$StartWhenAvailable;limit=$ExecutionTimeLimit}}
function Register-ScheduledTask {param($TaskName,$Action,$Trigger,$Principal,$Settings,$Description,[switch]$Force) $script:registered=[pscustomobject]@{name=$TaskName;action=$Action;triggers=$Trigger;principal=$Principal;settings=$Settings}}
$testRoot=Join-Path ([IO.Path]::GetTempPath()) '工具目录 带空格'
Register-BackupTask ([pscustomobject]@{vaultId='testid'}) $testRoot 'TEST\User' 'powershell.exe'
if($registered.principal.level -ne 'Limited' -or $registered.principal.logon -ne 'Interactive' -or $registered.principal.user -ne 'TEST\User'){throw 'Principal must be the current interactive user, without elevation.'}
if($registered.triggers.Count -ne 2 -or !$registered.triggers[0].login -or $registered.triggers[0].Delay -ne 'PT60S' -or !$registered.triggers[1].daily -or $registered.triggers[1].at -ne '21:00'){throw 'Trigger definition mismatch.'}
if($registered.settings.instances -ne 'IgnoreNew' -or !$registered.settings.catchup){throw 'Missing task guards.'}
if(!$registered.action.args.Contains(('-ConfigPath "{0}"' -f (Join-Path $testRoot 'settings.json')))){throw 'Quoted config path missing.'}
Write-Host 'PASS: mocked native task definition uses the current interactive account, Limited privilege, logon+daily triggers, quoted paths and IgnoreNew.'
