$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = Join-Path $Root "iniciar.log"
$NodeExe = "C:\Program Files\nodejs\node.exe"
$NpmCmd = "C:\Program Files\nodejs\npm.cmd"

function Log([string]$msg) {
  $line = "$(Get-Date -Format 'dd/MM HH:mm:ss') $msg"
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Clear-Host
Write-Host ""
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host "   SkoobPet - Painel Pos-Venda" -ForegroundColor Cyan
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host ""

Log "=== Nova execucao ==="

if (-not (Test-Path $NodeExe)) {
  Log "ERRO: Node.js nao encontrado em $NodeExe"
  Log "Instale em https://nodejs.org e tente novamente."
  Read-Host "Pressione Enter para fechar"
  exit 1
}

Log "Node: $(& $NodeExe --version)"

$LanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1 -ExpandProperty IPAddress)

if ($LanIp) {
  Log "IP na rede Wi-Fi: $LanIp"
}

Log "Liberando portas 5173, 5174 e 3001..."
foreach ($port in @(5173, 5174, 3001)) {
  Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    ForEach-Object {
      Log "Encerrando PID $($_.OwningProcess) na porta $port"
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 2

foreach ($rule in @(
  @{ Name = "SkoobPet Frontend 5173"; Port = 5173 },
  @{ Name = "SkoobPet Backend 3001"; Port = 3001 }
)) {
  $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
  if (-not $existing) {
    try {
      New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port -Action Allow -Profile Private | Out-Null
      Log "Firewall: porta $($rule.Port) liberada na rede local"
    } catch {
      Log "Firewall: execute INICIAR-PAINEL como Administrador se outro dispositivo nao conectar"
    }
  }
}

if (-not (Test-Path (Join-Path $Root "frontend\node_modules\vite"))) {
  Log "Instalando dependencias (primeira vez, aguarde)..."
  $env:PATH = "C:\Program Files\nodejs;$env:PATH"
  $env:NODE_OPTIONS = "--use-system-ca"
  Set-Location $Root
  & $NpmCmd run install:all 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) {
    Log "ERRO ao instalar dependencias. Veja iniciar.log"
    Read-Host "Pressione Enter para fechar"
    exit 1
  }
}

$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$env:NODE_OPTIONS = "--use-system-ca"
Set-Location $Root

Log "Aguardando servidores subirem e abrindo navegador..."
Start-Job -Name "AbrirNavegador" -ScriptBlock {
  for ($i = 0; $i -lt 45; $i++) {
    try {
      $null = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 2
      Start-Process "http://localhost:5173/login"
      return
    } catch {
      Start-Sleep -Seconds 1
    }
  }
} | Out-Null

Write-Host ""
Write-Host "  NAO FECHE ESTA JANELA!" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Neste computador:" -ForegroundColor White
Write-Host "  http://localhost:5173/login" -ForegroundColor Green
if ($LanIp) {
  Write-Host ""
  Write-Host "  Celular / outro PC (mesma Wi-Fi):" -ForegroundColor White
  Write-Host "  http://${LanIp}:5173/login" -ForegroundColor Green
  Write-Host ""
  Write-Host "  NAO use localhost no celular!" -ForegroundColor Red
}
Write-Host ""
Write-Host "  Login operacao: operacao / 100316" -ForegroundColor Gray
Write-Host "  Login financeiro: financeiro / 100316" -ForegroundColor Gray
Write-Host ""
Log "Iniciando backend (3001) e frontend (5173)..."

& $NodeExe (Join-Path $Root "scripts\dev.mjs") 2>&1 | ForEach-Object { Log $_ }

Log "Servidor encerrado."
Read-Host "Pressione Enter para fechar"
