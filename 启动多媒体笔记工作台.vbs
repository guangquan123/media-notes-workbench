Option Explicit
Dim shell, root, code
Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
code = shell.Run("wscript.exe " & Quote(root & "\scripts\run-hidden.vbs") & " npm.cmd run start:windows", 0, True)
WScript.Quit code
Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
