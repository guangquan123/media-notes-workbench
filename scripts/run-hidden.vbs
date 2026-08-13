Option Explicit

Dim shell, commandLine, exitCode, index
Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count = 0 Then
  WScript.Quit 2
End If

commandLine = WScript.Arguments(0)
For index = 1 To WScript.Arguments.Count - 1
  commandLine = commandLine & " " & Chr(34) & Replace(WScript.Arguments(index), Chr(34), Chr(34) & Chr(34)) & Chr(34)
Next

exitCode = shell.Run(commandLine, 0, True)
WScript.Quit exitCode
