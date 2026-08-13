Option Explicit
Dim shell, root, code
Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

code = shell.Run("wscript.exe " & Quote(root & "\scripts\run-hidden.vbs") & " npm.cmd run start:windows", 0, False)

MsgBox "已启动多媒体笔记工作台。" & vbCrLf & vbCrLf & "访问地址：http://localhost:3000" & vbCrLf & "运行日志：logs\dev.std.log", vbInformation, "多媒体笔记工作台"

WScript.Quit code
Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function