Option Explicit

Dim shell, fileSystem, commandLine, executablePath, exitCode, index
Dim tempExecutable, tempFolder, waitForExit, tempCreated
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count = 0 Then
  WScript.Quit 2
End If

waitForExit = False
executablePath = WScript.Arguments(0)
If Not fileSystem.FileExists(executablePath) Then
  WScript.Quit 3
End If
For index = 1 To WScript.Arguments.Count - 1
  If InStr(LCase(WScript.Arguments(index)), "installed-stop.js") > 0 Then
    waitForExit = True
  End If
Next

If waitForExit Then
  On Error Resume Next
  Set tempFolder = fileSystem.GetSpecialFolder(2)
  tempExecutable = fileSystem.BuildPath(tempFolder.Path, _
    fileSystem.GetBaseName(fileSystem.GetTempName) & ".exe")
  fileSystem.CopyFile executablePath, tempExecutable, True
  If Err.Number <> 0 Or Not fileSystem.FileExists(tempExecutable) Then
    Err.Clear
    On Error GoTo 0
    WScript.Quit 4
  End If
  On Error GoTo 0
  tempCreated = True
  executablePath = tempExecutable
End If

commandLine = Chr(34) & Replace(executablePath, Chr(34), Chr(34) & Chr(34)) & Chr(34)
For index = 1 To WScript.Arguments.Count - 1
  commandLine = commandLine & " " & Chr(34) & Replace(WScript.Arguments(index), Chr(34), Chr(34) & Chr(34)) & Chr(34)
Next

On Error Resume Next
exitCode = shell.Run(commandLine, 0, waitForExit)
If Err.Number <> 0 Then
  Err.Clear
  exitCode = 5
End If
On Error GoTo 0

If tempCreated Then
  On Error Resume Next
  fileSystem.DeleteFile tempExecutable, True
  On Error GoTo 0
End If

WScript.Quit exitCode
