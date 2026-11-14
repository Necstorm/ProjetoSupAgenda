Set f = CreateObject("Scripting.FileSystemObject")
d = f.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c cd /d """ & d & """ && npm start", 0, False
