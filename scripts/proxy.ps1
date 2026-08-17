# ============================================================
# proxy.ps1 - DSH network proxy helper (READ-ONLY version)
# ------------------------------------------------------------
# Usage:
#   .\proxy.ps1 status       # report both proxies + system proxy state
#   .\proxy.ps1 check <port> # verify external access via given port
#
# Machine layout (user's deliberate config per conversation-handoff.md):
#   system proxy (registry) -> 127.0.0.1:7890 (haohaoyun hhycenterCore)
#   git global proxy        -> http://127.0.0.1:7890 (haohaoyun)
#   clash verge core        -> 127.0.0.1:7897 (verge-mihomo)
# Fallback recipe (7890 down): git -c http.proxy=http://127.0.0.1:7897
#   -c https.proxy=http://127.0.0.1:7897 -c http.sslBackend=openssl
# This script NEVER writes the registry or git config. It only detects.
# ============================================================

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('status', 'check')]
    [string]$Action,
    [int]$Port = 7890
)

$LogFile = 'C:\Users\32169\Desktop\harness测试\操作日志.log'

function Test-PortAlive([int]$p) {
    $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 3 "http://127.0.0.1:$p/" 2>$null
    return ($code -in '200', '400', '407')
}

function Get-SysProxyState {
    $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
    $p = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue
    return [pscustomobject]@{ Enabled = $p.ProxyEnable; Server = $p.ProxyServer }
}

# ---------------- status ----------------
if ($Action -eq 'status') {
    Write-Host '===== proxy status ====='
    $app1 = Get-Process hhycenterCore -ErrorAction SilentlyContinue
    $app2 = Get-Process clash-verge -ErrorAction SilentlyContinue
    $core2 = Get-Process verge-mihomo -ErrorAction SilentlyContinue
    Write-Host ("haohaoyun(7890)  : {0} / port alive: {1}" -f $(if ($app1) { 'running' } else { 'not running' }), $(if (Test-PortAlive 7890) { 'YES' } else { 'NO' }))
    Write-Host ("clash-verge(7897): app={0} core={1} / port alive: {2}" -f $(if ($app2) { 'running' } else { 'not running' }), $(if ($core2) { 'running' } else { 'not running' }), $(if (Test-PortAlive 7897) { 'YES' } else { 'NO' }))
    $s = Get-SysProxyState
    Write-Host ("system proxy     : Enabled={0} Server={1} (untouched)" -f $s.Enabled, $s.Server)
    $target = if ($s.Enabled -eq 1) { 'http://' + ($s.Server -replace '^https?://', '') } else { 'http://127.0.0.1:7890' }
    if ($target -match '^http') {
        $t = $target; try { $c = (Invoke-WebRequest -Uri 'https://api.github.com' -Proxy $t -TimeoutSec 10 -UseBasicParsing).StatusCode; Write-Host "external check via ${target}: HTTP $c" } catch { Write-Host "external check via ${target}: FAILED - $($_.Exception.Message)" }
    }
    exit 0
}

# ---------------- check ----------------
if ($Action -eq 'check') {
    if (-not (Test-PortAlive $Port)) { Write-Host "port $Port not alive"; exit 1 }
    $proxy = "http://127.0.0.1:$Port"
    try {
        $c = (Invoke-WebRequest -Uri 'https://api.github.com' -Proxy $proxy -TimeoutSec 12 -UseBasicParsing).StatusCode
        Write-Host "external access via $proxy : OK (HTTP $c)"
        Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] proxy.ps1: verified external access via $proxy (HTTP $c)" -Encoding UTF8
        exit 0
    } catch {
        Write-Host "external access via $proxy : FAILED - $($_.Exception.Message)"
        exit 1
    }
}
