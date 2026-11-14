@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause & exit /b
)
if not exist node_modules\qrcode (
  echo Instalando dependencias, aguarde...
  call npm install
)
start "" /b cmd /c "npm start"
