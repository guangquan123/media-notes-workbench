Option Explicit
Dim shell, fso, root, mshtaPath, htaPath, htaUrl, action
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
mshtaPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\mshta.exe")
htaPath = fso.BuildPath(root, "scripts\workbench-launcher.hta")
action = "start"
htaUrl = "file:///" & Replace(htaPath, "\", "/") & "#" & action

shell.CurrentDirectory = root
shell.Environment("PROCESS")("WORKBENCH_LAUNCHER_ACTION") = action
shell.Run Quote(mshtaPath) & " " & Quote(htaUrl), 1, False

Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function