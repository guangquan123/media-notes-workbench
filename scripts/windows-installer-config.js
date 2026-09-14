#!/usr/bin/env node
'use strict';

function normalizePath(value) {
  return value.replace(/\\/gu, '/');
}

const APP_ID = 'A8F7FD44-40D9-4AF7-9F80-2A7A1D90F2DA';

function buildInstallerScript({ sourcePath, version, iconPath }) {
  if (!sourcePath) throw new Error('sourcePath is required');
  if (!version) throw new Error('version is required');

  const normalizedSourcePath = normalizePath(sourcePath);
  const normalizedIconPath = normalizePath(
    iconPath || `${sourcePath}/dist/client/app-icon.ico`,
  );

  return `#define AppVersion "${version}"
[Setup]
AppId={{${APP_ID}}}
AppName=Media Notes Workbench
AppVersion={#AppVersion}
AppPublisher=Media Notes Workbench
DefaultDirName={autopf}\\Media Notes Workbench
DefaultGroupName=Media Notes Workbench
SetupIconFile="${normalizedIconPath}"
Uninstallable=yes
CreateUninstallRegKey=yes
UninstallDisplayIcon={app}\\dist\\client\\app-icon.ico
UninstallDisplayName=Media Notes Workbench
PrivilegesRequired=admin
DisableDirPage=no
DirExistsWarning=yes
AppendDefaultDirName=yes
AllowRootDirectory=no
DisableProgramGroupPage=yes
MinVersion=10.0
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.
OutputBaseFilename=Media-Notes-Workbench-{#AppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110

[Messages]
WindowsVersionNotSupported=Media Notes Workbench requires 64-bit Windows 10 or 11.
ConfirmUninstall=卸载前会停止本地服务；本地笔记、配置和历史数据默认保留在 {localappdata}\\MediaNotesWorkbench。确定继续卸载吗？

[Files]
Source: "${normalizedSourcePath}/*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "${normalizedSourcePath}/package-manifest.json"; DestDir: "{app}"; DestName: ".media-notes-workbench-install-marker"; Flags: ignoreversion uninsneveruninstall

[Icons]
Name: "{autodesktop}\\Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\workbench-launcher.vbs"" ""start"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\workbench-launcher.vbs"" ""start"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Stop Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-stop.js"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Restart Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-restart.js"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Open Media Notes Logs"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\open-logs.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Uninstall Media Notes Workbench"; Filename: "{uninstallexe}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"

[UninstallRun]
Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-stop.js"""; WorkingDir: "{app}"; StatusMsg: "正在停止本地服务，请稍候…"; Flags: runhidden waituntilterminated; RunOnceId: "StopWorkbench"

[Code]
function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
  RuntimeNode: String;
  StopScript: String;
begin
  Result := True;
  RuntimeNode := ExpandConstant('{app}\\runtime\\node.exe');
  StopScript := ExpandConstant('{app}\\scripts\\installed-stop.js');
  if (not FileExists(RuntimeNode)) or (not FileExists(StopScript)) then
    exit;
  if not Exec(RuntimeNode, AddQuotes(StopScript), ExpandConstant('{app}'), SW_HIDE,
    ewWaitUntilTerminated, ResultCode) then
  begin
    MsgBox('无法启动停止服务程序，卸载已取消。请先从开始菜单停止工作台后重试。',
      mbError, MB_OK);
    Result := False;
    exit;
  end;
  if ResultCode <> 0 then
  begin
    MsgBox('本地服务未能安全停止，卸载已取消。请保存工作并重试；如问题持续，请查看日志。',
      mbError, MB_OK);
    Result := False;
  end;
end;


`;
}

module.exports = {
  APP_ID,
  buildInstallerScript,
};
