# restart-watchdog.ps1 — detached restart of the DSH web server (auto-run once).
# Kills the old `dsh web` process and starts a fresh one so the newly added
# @dsh-external/dsh-super-injector bundle takes effect.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\32169\.dsh\profiles\web\web-restart.log'
function Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 }

Log 'watchdog started; waiting 60s for the current turn to finish...'
Start-Sleep -Seconds 60

# 1. Kill the old web server (node host + its cmd wrapper), if still alive.
foreach ($id in @(33416, 5628)) {
  if (Get-Process -Id $id -ErrorAction SilentlyContinue) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    Log "killed old PID $id"
  }
}

# 2. Wait for port 3080 to free up.
$deadline = (Get-Date).AddSeconds(20)
while ((Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Seconds 1 }
if (Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue) {
  Log 'port 3080 still busy after cleanup; aborting restart'
  exit 1
}
Log 'port 3080 free'

# 3. Start the new web server, same command line the old one used.
$env:DSH_HOME = 'C:\Users\32169\.dsh'
$node = 'C:\nvm4w\nodejs\node.exe'
$bin  = 'C:\Users\32169\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh\lib\bin.js'
$out  = 'C:\Users\32169\.dsh\profiles\web\web-server.log'
$p = Start-Process -FilePath $node -ArgumentList @($bin, 'web') `
  -WorkingDirectory 'C:\Users\32169\Desktop\harness测试' `
  -WindowStyle Hidden `
  -RedirectStandardOutput $out -RedirectStandardError $out -PassThru
Log "started new web server PID $($p.Id)"

# 4. Verify it comes up on 3080.
Start-Sleep -Seconds 12
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3080' -UseBasicParsing -TimeoutSec 8
  Log "verification: HTTP $($r.StatusCode)"
} catch {
  Log "verification FAILED: $($_.Exception.Message)"
}
Log 'watchdog done'
