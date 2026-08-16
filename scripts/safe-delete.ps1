# Safe Delete — 误删保险
# 用法：.\safe-delete.ps1 -Path "要删除的文件或目录"
# 作用：不真删，而是移动到 _trash 回收目录（带时间戳），并写入操作日志。
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Path,
    [string]$Reason = "未说明"
)
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$trash = Join-Path $base '_trash'
$log = Join-Path $base '操作日志.log'
New-Item -ItemType Directory -Force -Path $trash | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($p in $Path) {
    $full = (Resolve-Path -LiteralPath $p -ErrorAction Stop).Path
    if (-not (Test-Path -LiteralPath $full)) { Write-Host "跳过（不存在）: $full"; continue }
    $name = Split-Path -Leaf $full
    $dest = Join-Path $trash "$stamp-$name"
    Move-Item -LiteralPath $full -Destination $dest
    $entry = "[{0}] 移入回收: {1} -> {2} | 原因: {3}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $full, $dest, $Reason
    Add-Content -Path $log -Value $entry -Encoding UTF8
    Write-Host "已移入回收: $full`n  -> $dest"
}
Write-Host "日志: $log"
