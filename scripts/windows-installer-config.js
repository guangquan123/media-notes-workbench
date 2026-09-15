#!/usr/bin/env node
'use strict';

function normalizePath(value) {
  return value.replace(/\\/gu, '/');
}

const APP_ID = 'A8F7FD44-40D9-4AF7-9F80-2A7A1D90F2DA';
const INNO_COMPRESSION_LEVELS = new Set(['fast', 'normal', 'max', 'ultra']);

function buildInstallerScript({
  sourcePath,
  version,
  iconPath,
  compression = 'fast',
  solidCompression = false,
}) {
  if (!sourcePath) throw new Error('sourcePath is required');
  if (!version) throw new Error('version is required');
  if (!INNO_COMPRESSION_LEVELS.has(compression)) {
    throw new Error(
      `compression must be one of: ${Array.from(INNO_COMPRESSION_LEVELS).join(', ')}`,
    );
  }
  if (typeof solidCompression !== 'boolean') {
    throw new Error('solidCompression must be a boolean');
  }

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
CloseApplications=no
RestartApplications=no
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
Compression=lzma2/${compression}
SolidCompression=${solidCompression ? 'yes' : 'no'}
WizardStyle=modern
WizardSizePercent=110

[Messages]
WindowsVersionNotSupported=Media Notes Workbench requires 64-bit Windows 10 or 11.
ConfirmUninstall=确定要卸载 %1 吗？

[Files]
Source: "${normalizedSourcePath}/*"; DestDir: "{app}"; Excludes: "tools\\*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "${normalizedSourcePath}/tools/*"; DestDir: "{app}\\tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "${normalizedSourcePath}/package-manifest.json"; DestDir: "{app}"; DestName: ".media-notes-workbench-install-marker"; Flags: ignoreversion uninsneveruninstall

[Icons]
Name: "{autodesktop}\\Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\workbench-launcher.vbs"" ""start"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\workbench-launcher.vbs"" ""start"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Stop Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-stop.js"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Restart Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-restart.js"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Open Media Notes Logs"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\open-logs.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"
Name: "{group}\\Uninstall Media Notes Workbench"; Filename: "{uninstallexe}"; IconFilename: "{app}\\dist\\client\\app-icon.ico"

[Code]
var
  RemoveUserData: Boolean;
  UserDataDirectory: String;

function VerifyBundledTools(): Boolean;
var
  Missing: String;
begin
  Result := True;
  Missing := '';
  if not FileExists(ExpandConstant('{app}\\tools\\ffmpeg.exe')) then
    Missing := Missing + 'ffmpeg.exe, ';
  if not FileExists(ExpandConstant('{app}\\tools\\ffprobe.exe')) then
    Missing := Missing + 'ffprobe.exe, ';
  if not FileExists(ExpandConstant('{app}\\tools\\yt-dlp.exe')) then
    Missing := Missing + 'yt-dlp.exe, ';
  if not FileExists(ExpandConstant('{app}\\tools\\avcodec-62.dll')) then
    Missing := Missing + 'avcodec-62.dll, ';
  if not FileExists(ExpandConstant('{app}\\tools\\avformat-62.dll')) then
    Missing := Missing + 'avformat-62.dll, ';
  if not FileExists(ExpandConstant('{app}\\tools\\avutil-60.dll')) then
    Missing := Missing + 'avutil-60.dll, ';
  if Missing <> '' then
  begin
    MsgBox(
      '媒体处理依赖未能完整安装：' + Missing + #13#10#13#10 +
      '请重新运行安装程序；如果问题仍然存在，请查看安装日志。',
      mbError, MB_OK);
    Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    if not VerifyBundledTools() then
      Abort;
end;

function GetDefaultUserDataDirectory(): String;
begin
  Result := ExpandConstant('{localappdata}\\MediaNotesWorkbench');
end;

function SelectUserDataAction(): Boolean;
var
  Choice: Integer;
begin
  Result := True;
  RemoveUserData := False;
  UserDataDirectory := GetDefaultUserDataDirectory();

  if UninstallSilent then
  begin
    Log('静默卸载默认保留本地数据：' + UserDataDirectory);
    exit;
  end;

  if not DirExists(UserDataDirectory) then
  begin
    MsgBox(
      '未发现本地数据目录。应用文件将被卸载。'#13#10#13#10 +
      '数据目录：'#13#10 + UserDataDirectory,
      mbInformation, MB_OK);
    exit;
  end;

  Choice := MsgBox(
    '请选择如何处理当前 Windows 用户的本地数据：'#13#10#13#10 +
    UserDataDirectory + #13#10#13#10 +
    '该目录包含本地笔记、配置、历史记录、附件、缓存和日志。'#13#10 +
    '选择“是”会卸载应用并永久删除上面的目录；'#13#10 +
    '选择“否”会仅卸载应用并保留本地数据（推荐）；'#13#10 +
    '选择“取消”会取消整个卸载。'#13#10#13#10 +
    '用户自行配置的外部数据目录不会被自动删除。',
    mbConfirmation, MB_YESNOCANCEL or MB_DEFBUTTON2);

  if Choice = IDYES then
  begin
    RemoveUserData := True;
    Log('用户选择删除本地数据：' + UserDataDirectory);
  end
  else if Choice = IDNO then
    Log('用户选择保留本地数据：' + UserDataDirectory)
  else
    Result := False;
end;

function StopWorkbenchService(): Boolean;
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

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  NeedsRestart := False;
  Log('安装前停止 Media Notes Workbench 本地服务。');
  if StopWorkbenchService() then
    Result := ''
  else
    Result :=
      'Media Notes Workbench 仍在运行，安装程序无法安全更新运行时文件。' +
      #13#10#13#10 +
      '请从开始菜单停止 Media Notes Workbench 后重试。';
end;

procedure RemoveSelectedUserData();
begin
  if not RemoveUserData then
    exit;
  if UserDataDirectory <> GetDefaultUserDataDirectory() then
  begin
    Log('拒绝删除非默认本地数据目录：' + UserDataDirectory);
    exit;
  end;
  if not DirExists(UserDataDirectory) then
    exit;
  if not DelTree(UserDataDirectory, True, True, True) then
    MsgBox(
      '应用文件已卸载，但部分本地数据无法删除。请关闭正在使用该目录的程序后，手动处理：'#13#10#13#10 +
      UserDataDirectory,
      mbError, MB_OK)
  else
    Log('已删除本地数据：' + UserDataDirectory);
end;

function InitializeUninstall(): Boolean;
begin
  Result := SelectUserDataAction();
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    if not StopWorkbenchService() then
      Abort;
  end
  else if CurUninstallStep = usPostUninstall then
    RemoveSelectedUserData();
end;


`;
}

module.exports = {
  APP_ID,
  buildInstallerScript,
};
