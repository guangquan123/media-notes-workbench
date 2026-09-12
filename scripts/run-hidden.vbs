Option Explicit

Dim shell, fileSystem, commandLine, executablePath, exitCode, index
Dim tempExecutable, tempFolder, waitForExit
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count = 0 Then
  WScript.Quit 2
End If

waitForExit = False
executablePath = WScript.Arguments(0)
For index = 1 To WScript.Arguments.Count - 1
  If InStr(LCase(WScript.Arguments(index)), "installed-stop.js") > 0 Then
    waitForExit = True
  End If
Next

If waitForExit Then
  Set tempFolder = fileSystem.GetSpecialFolder(2)
  tempExecutable = fileSystem.BuildPath(tempFolder.Path, _
    fileSystem.GetBaseName(fileSystem.GetTempName) & ".exe")
  fileSystem.CopyFile executablePath, tempExecutable, True
  executablePath = tempExecutable
End If

commandLine = Chr(34) & Replace(executablePath, Chr(34), Chr(34) & Chr(34)) & Chr(34)
For index = 1 To WScript.Arguments.Count - 1
  commandLine = commandLine & " " & Chr(34) & Replace(WScript.Arguments(index), Chr(34), Chr(34) & Chr(34)) & Chr(34)
Next

exitCode = shell.Run(commandLine, 0, waitForExit)

If waitForExit Then
  On Error Resume Next
  fileSystem.DeleteFile tempExecutable, True
  On Error GoTo 0
End If

WScript.Quit exitCode
