@echo off
cd /d "%~dp0"
start "PetShop Painel - Servico" /MIN powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\servico-painel.ps1"
echo.
echo  Painel iniciado em segundo plano!
echo  Acesse: http://localhost:5173/login
echo.
echo  O site reinicia sozinho se cair.
echo  Para parar: execute PARAR-PAINEL.bat
echo.
timeout /t 5
