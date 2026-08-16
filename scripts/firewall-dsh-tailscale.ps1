# 防火墙规则：仅允许 Tailscale 网段 (100.64.0.0/10) 访问本机 3080
netsh advfirewall firewall delete rule name="DSH Web Tailscale" | Out-Null
netsh advfirewall firewall add rule name="DSH Web Tailscale" dir=in action=allow protocol=TCP localport=3080 remoteip=100.64.0.0/10 profile=any
if ($LASTEXITCODE -eq 0) { Write-Host 'OK: firewall rule added' } else { Write-Host "FAIL: exit $LASTEXITCODE" }
