# restart-dsh.ps1 — kill the DSH web server on :3080 and start it fresh (hidden).
# Runs detached via Task Scheduler so it survives the server's death.
$ErrorActionPreference = 'Continue'
$statusFile = 'C:\Users\32169\Desktop\harness测试\restart-dsh.status.log'
function Status($msg) {
  try { Add-Content -Path $statusFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) } catch { }
}

Status 'restart script started'

# 1. Kill whatever listens on :3080
$conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  $target = $conn.OwningProcess
  Status "killing PID $target"
  Stop-Process -Id $target -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
}
$conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Status "ERROR: port 3080 still listening (PID $($conn.OwningProcess)); aborting"
  exit 1
}
Status 'port 3080 free'

# 2. Start dsh web hidden (same command the user's launcher uses)
$dsh = 'C:\Users\32169\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\.bin\dsh.cmd'
if (-not (Test-Path -LiteralPath $dsh)) {
  Status "ERROR: dsh.cmd not found at $dsh"
  exit 1
}
$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$dsh`" web" -WindowStyle Hidden -PassThru
Status "dsh web started (cmd PID $($p.Id))"

# 3. Wait for the port (up to 60s)
$ok = $false
for ($i = 1; $i -le 60; $i++) {
  Start-Sleep -Seconds 1
  $c = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { $ok = $true; break }
}
if ($ok) { Status "port 3080 up after ${i}s (PID $($c.OwningProcess))" } else { Status 'ERROR: port 3080 not up within 60s' }
