Option Explicit
Dim shell, root, code
Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

code = shell.Run("cmd.exe /c npm.cmd run stop:windows", 1, True)

MsgBox "已停止多媒体笔记工作台。", vbInformation, "多媒体笔记工作台"

WScript.Quit code