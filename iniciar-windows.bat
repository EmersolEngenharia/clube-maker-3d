@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 LTS ou superior em https://nodejs.org
  echo Depois, feche esta janela e abra este arquivo novamente.
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 (
  echo Atualize o Node.js para a versao 24 ou superior em https://nodejs.org
  pause
  exit /b 1
)
echo Clube Maker 3D - teste local
echo Mantenha esta janela aberta enquanto usa o portal.
echo Endereco: http://127.0.0.1:3000
echo Para encerrar, pressione Ctrl+C.
start "" /b powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:3000'"
node server.mjs
pause
