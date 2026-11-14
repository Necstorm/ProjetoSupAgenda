@echo off
setlocal
set "DEST=%LOCALAPPDATA%\AgendaApp"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause & exit /b
)
echo Instalando ou atualizando em %DEST% ... (seus dados nao sao apagados)
robocopy "%~dp0." "%DEST%" /E /XD node_modules dist /XF Instalar.bat >nul
cd /d "%DEST%"
call npm install
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\criar-atalho.ps1" "%DEST%"
echo.
echo Pronto! Use o atalho "Agenda" na area de trabalho ou no menu Iniciar.
echo Para ATUALIZAR no futuro: extraia o novo zip e rode Instalar.bat de novo.
start "" wscript.exe "%DEST%\Iniciar.vbs"
pause
