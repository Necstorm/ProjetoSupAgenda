param([string]$Dest)
$w = New-Object -ComObject WScript.Shell
foreach ($p in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $s = $w.CreateShortcut((Join-Path $p 'Agenda.lnk'))
  $s.TargetPath = 'wscript.exe'
  $s.Arguments = '"' + (Join-Path $Dest 'Iniciar.vbs') + '"'
  $s.WorkingDirectory = $Dest
  $s.IconLocation = (Join-Path $Dest 'assets\icon.ico')
  $s.Save()
}
