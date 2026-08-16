$ErrorActionPreference = 'Stop'
$log = 'C:\Windows\Temp\dsh-ts-install.log'
function W($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }
Remove-Item $log -ErrorAction SilentlyContinue
try {
    W '=== install start ==='
    $json = Invoke-RestMethod -Uri 'https://pkgs.tailscale.com/stable/?mode=json'
    $msiName = $json.MSIs.amd64
    $url = "https://pkgs.tailscale.com/stable/$msiName"
    W "download: $url"
    $dir = Join-Path $env:TEMP 'dsh-tailscale'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $msi = Join-Path $dir 'tailscale.msi'
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    $size = (Get-Item $msi).Length
    W "msi size: $size"
    $p = Start-Process msiexec -ArgumentList @('/i', $msi, '/qn', '/norestart') -Wait -PassThru
    W "msiexec exit: $($p.ExitCode)"
    W "tailscale.exe: $(Test-Path 'C:\Program Files\Tailscale\tailscale.exe')"
} catch {
    W "ERROR: $($_.Exception.Message)"
}
W '=== install end ==='
