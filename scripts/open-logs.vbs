Option Explicit

Dim shell, fileSystem, localAppData, workbenchFolder, logsFolder
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
If localAppData = "%LOCALAPPDATA%" Or localAppData = "" Then
  localAppData = shell.ExpandEnvironmentStrings("%TEMP%")
End If

workbenchFolder = fileSystem.BuildPath(localAppData, "MediaNotesWorkbench")
logsFolder = fileSystem.BuildPath(workbenchFolder, "logs")

Sub EnsureFolder(folderPath)
  Dim parentFolder
  If fileSystem.FolderExists(folderPath) Then Exit Sub
  parentFolder = fileSystem.GetParentFolderName(folderPath)
  If parentFolder <> "" And Not fileSystem.FolderExists(parentFolder) Then
    EnsureFolder parentFolder
  End If
  If Not fileSystem.FolderExists(folderPath) Then
    fileSystem.CreateFolder folderPath
  End If
End Sub

On Error Resume Next
EnsureFolder logsFolder
shell.Run "explorer.exe " & Chr(34) & logsFolder & Chr(34), 1, False
On Error GoTo 0
