$ErrorActionPreference = 'Continue'
$log = 'C:\Windows\Temp\dsh-web-restart.log'
function Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }
Remove-Item $log -ErrorAction SilentlyContinue
Log '=== restart start ==='
Start-Sleep -Seconds 10
$ts = 'C:\Program Files\Tailscale\tailscale.exe'
$tailIp = (& $ts ip -4 2>$null | Select-Object -First 1).Trim()
if (-not $tailIp) { Log 'FAIL: no tailnet IP'; exit 1 }
Log "tailnet IP: $tailIp"
$line = netstat -ano | Select-String ':3080\s+\S+\s+LISTENING' | Select-Object -First 1
if ($line) {
    $oldPid = ($line.Line -split '\s+')[-1]
    Log "killing old pid $oldPid"
    & taskkill /PID $oldPid /T /F | Out-Null
    Start-Sleep -Seconds 2
} else { Log 'WARN: no listener on 3080' }
$node = 'C:\nvm4w\nodejs\node.exe'
$bin = 'D:\deepseekexe\DeepSeek Harness\app\node_modules\@deepseek-ai\dsh\lib\bin.js'
$out = 'C:\Windows\Temp\dsh-web.out.log'
$err = 'C:\Windows\Temp\dsh-web.err.log'
$argStr = '"{0}" web --host 0.0.0.0 --trusted-host {1}:3080' -f $bin, $tailIp
Log "starting: $node $argStr"
$p = Start-Process -FilePath $node -ArgumentList $argStr -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
Log "started pid $($p.Id)"
Start-Sleep -Seconds 10
$check = netstat -ano | Select-String ':3080\s+\S+\s+LISTENING' | Select-Object -First 1
if ($check) { Log "LISTENING: $($check.Line.Trim())" } else { Log 'WARN: not listening after 10s' }
Log '=== restart done ==='
