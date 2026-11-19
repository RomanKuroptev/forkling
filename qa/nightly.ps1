# The nightly AI review on Roman's PC (audit spec section 12, decision D4).
#
# WRITTEN, NOT SCHEDULED. Nothing runs this on its own: Roman switches schedules on when he says so
# (docs/spec/audit/steps.md, "No schedules yet"). Until then it is run by hand, if at all:
#   powershell -NoProfile -ExecutionPolicy Bypass -File qa\nightly.ps1
#
# The one line that would make it a Windows scheduled task at 07:15 (for Roman, later; do not run it now):
#   Register-ScheduledTask -TaskName 'forkling-qa-nightly' -Trigger (New-ScheduledTaskTrigger -Daily -At '07:15') -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Code\forkling\qa\nightly.ps1"' -WorkingDirectory 'C:\Code\forkling')
#
# A headless run cannot ask for permission, so before switching it on Roman also decides which tools
# `claude -p` may use (his Claude Code settings).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$date = Get-Date -Format 'yyyy-MM-dd'
$out = Join-Path $root 'qa-out'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$log = Join-Path $out "nightly-$date.log"

# Only on a clean main, so the run checks what is merged.
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$dirty = git status --porcelain
if ($branch -ne 'main' -or $dirty) {
  "Not run: the checkout is on '$branch' or has uncommitted changes. /qa nightly runs only on a clean main." | Tee-Object -FilePath $log
  exit 1
}

"/qa nightly started $(Get-Date -Format o)" | Tee-Object -FilePath $log
claude -p "/qa nightly" 2>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
"/qa nightly ended $(Get-Date -Format o) with exit code $code" | Tee-Object -FilePath $log -Append
exit $code
