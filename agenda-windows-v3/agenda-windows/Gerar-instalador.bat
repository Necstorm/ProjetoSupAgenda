@echo off
cd /d "%~dp0"
call npm install
call npm run dist
echo Instalador criado na pasta dist.
pause
