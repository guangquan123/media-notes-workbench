#!/usr/bin/env node
'use strict';

function normalizePath(value) {
  return value.replace(/\\/gu, '/');
}

function buildInstallerScript({ sourcePath, version, iconPath }) {
  if (!sourcePath) throw new Error('sourcePath is required');
  if (!version) throw new Error('version is required');

  const normalizedSourcePath = normalizePath(sourcePath);
  const normalizedIconPath = normalizePath(
    iconPath || `${sourcePath}/dist/client/app-icon.ico`,
  );

  return `#define AppVersion "${version}"
[Setup]
AppId={{A8F7FD44-40D9-4AF7-9F80-2A7A1D90F2DA}
AppName=多媒体笔记工作台
AppVersion={#AppVersion}
AppPublisher=多媒体笔记工作台
DefaultDirName={localappdata}\\Programs\\多媒体笔记工作台
DefaultGroupName=多媒体笔记工作台
SetupIconFile="${normalizedIconPath}"
Uninstallable=yes
CreateUninstallRegKey=yes
UninstallDisplayIcon={app}\\dist\\client\\app-icon.ico
UninstallDisplayName=多媒体笔记工作台
PrivilegesRequired=lowest
MinVersion=10.0
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.
OutputBaseFilename=多媒体笔记工作台-{#AppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

[Messages]
WindowsVersionNotSupported=多媒体笔记工作台仅支持 Windows 10/11 64 位系统。

[Files]
Source: "${normalizedSourcePath}/*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\\多媒体笔记工作台"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-launcher.js"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\多媒体笔记工作台"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-launcher.js"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\卸载多媒体笔记工作台"; Filename: "{uninstallexe}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"

[UninstallRun]
Filename: "{app}\\runtime\\node.exe"; Parameters: """{app}\\scripts\\installed-stop.js"""; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "StopWorkbench"
`;
}

module.exports = {
  buildInstallerScript,
};
