@echo off
echo Parando PetShop Painel...
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*servico-painel.ps1*' -or $_.CommandLine -like '*scripts\\dev.mjs*' -or $_.CommandLine -like '*iniciar-servico-oculto.vbs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; foreach ($p in 5173,5174,3001) { Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo Pronto.
timeout /t 3
