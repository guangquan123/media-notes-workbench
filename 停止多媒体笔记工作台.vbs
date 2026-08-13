Option Explicit
Dim shell, root
Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
WScript.Quit shell.Run("wscript.exe " & Quote(root & "\scripts\run-hidden.vbs") & " npm.cmd run stop:windows", 0, True)
Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
