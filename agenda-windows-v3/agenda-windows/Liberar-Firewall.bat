@echo off
net session >nul 2>nul
if errorlevel 1 (
  echo Clique com o botao direito neste arquivo e escolha "Executar como administrador".
  pause & exit /b
)
netsh advfirewall firewall delete rule name="Agenda Celular" >nul 2>nul
netsh advfirewall firewall add rule name="Agenda Celular" dir=in action=allow protocol=TCP localport=8787-8792 remoteip=LocalSubnet,100.64.0.0/10 profile=any
echo Pronto. O celular na mesma rede ou no Tailscale ja pode acessar a agenda.
pause
