$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogFile = Join-Path $Root "servico.log"
$NodeExe = "C:\Program Files\nodejs\node.exe"
$DevScript = Join-Path $Root "scripts\dev.mjs"

function Log([string]$msg) {
  $line = "$(Get-Date -Format 'dd/MM HH:mm:ss') $msg"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Free-Ports {
  foreach ($port in @(5173, 5174, 3001)) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
}

$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$env:NODE_OPTIONS = "--use-system-ca"
Set-Location $Root

Log "=== Servico do painel iniciado ==="

if (-not (Test-Path $NodeExe)) {
  Log "ERRO: Node.js nao encontrado"
  exit 1
}

Free-Ports
Start-Sleep -Seconds 2

while ($true) {
  Log "Subindo backend (3001) e frontend (5173)..."
  try {
    & $NodeExe $DevScript 2>&1 | ForEach-Object { Log $_ }
  } catch {
    Log "ERRO: $($_.Exception.Message)"
  }
  Log "Servidor caiu. Reiniciando em 5 segundos..."
  Free-Ports
  Start-Sleep -Seconds 5
}
