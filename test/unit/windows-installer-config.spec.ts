const {
  buildInstallerScript,
} = require('../../scripts/windows-installer-config.js');

describe('Windows installer configuration', () => {
  const script = buildInstallerScript({
    sourcePath: '../app',
    version: '2.2.5',
  });

  it('registers Windows uninstall and creates an explicit Start menu uninstall shortcut', () => {
    expect(script).toContain('Uninstallable=yes');
    expect(script).toContain('CreateUninstallRegKey=yes');
    expect(script).toContain('AppVersion={#AppVersion}');
    expect(script).toContain(
      'Name: "{group}\\Uninstall Media Notes Workbench"; Filename: "{uninstallexe}"',
    );
  });

  it('keeps the desktop to one launch icon and puts service controls in the Start menu', () => {
    const desktopEntries = script.match(/Name: "\{autodesktop\}\\/gu) || [];

    expect(desktopEntries).toHaveLength(1);
    expect(script).toContain(
      'Name: "{autodesktop}\\Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\workbench-launcher.vbs"" ""start"""',
    );
    expect(script).not.toContain(
      'Name: "{autodesktop}\\Media Notes Workbench"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\run-hidden.vbs""',
    );
    expect(script).toContain('Name: "{group}\\Stop Media Notes Workbench"');
    expect(script).toContain('scripts\\installed-stop.js');
    expect(script).toContain('Name: "{group}\\Restart Media Notes Workbench"');
    expect(script).toContain('scripts\\installed-restart.js');
    expect(script).toContain('Name: "{group}\\Open Media Notes Logs"');
    expect(script).toContain(
      'Name: "{group}\\Open Media Notes Logs"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\scripts\\open-logs.vbs"""',
    );
    expect(script).not.toContain('{localappdata}\\MediaNotesWorkbench\\logs');
  });

  it('shows the expanded local-data path and keeps data by default', () => {
    expect(script).toContain('ConfirmUninstall=确定要卸载 %1 吗？');
    expect(script).not.toContain(
      'ConfirmUninstall=卸载前会停止本地服务；本地笔记、配置和历史数据默认保留在 {localappdata}\\MediaNotesWorkbench。确定继续卸载吗？',
    );
    expect(script).toContain('function GetDefaultUserDataDirectory(): String;');
    expect(script).toContain(
      "Result := ExpandConstant('{localappdata}\\MediaNotesWorkbench');",
    );
    expect(script).toContain('function SelectUserDataAction(): Boolean;');
    expect(script).toContain('RemoveUserData := False;');
    expect(script).toContain('MB_YESNOCANCEL or MB_DEFBUTTON2');
    expect(script).toContain("'选择“是”会卸载应用并永久删除上面的目录；'");
    expect(script).toContain("'选择“否”会仅卸载应用并保留本地数据（推荐）；'");
    expect(script).toContain("'选择“取消”会取消整个卸载。'");
    expect(script).toContain('if UninstallSilent then');
    expect(script).toContain('静默卸载默认保留本地数据');
  });

  it('stops the service once and deletes only selected default local data', () => {
    expect(script).not.toContain('[UninstallRun]');
    expect(script).toContain('function StopWorkbenchService(): Boolean;');
    expect(script).toContain('CloseApplications=no');
    expect(script).toContain('RestartApplications=no');
    expect(script).toContain(
      'function PrepareToInstall(var NeedsRestart: Boolean): String;',
    );
    expect(script).toContain(
      "Log('安装前停止 Media Notes Workbench 本地服务。');",
    );
    expect(script).toContain("if StopWorkbenchService() then");
    expect(script).toContain('Chr(13) + Chr(10) + Chr(13) + Chr(10) +');
    expect(script).toContain('function InitializeUninstall(): Boolean;');
    expect(script).toContain('Result := SelectUserDataAction();');
    expect(script).toContain(
      'procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);',
    );
    expect(script).toContain('if CurUninstallStep = usUninstall then');
    expect(script).toContain('if not StopWorkbenchService() then');
    expect(script).toContain('else if CurUninstallStep = usPostUninstall then');
    expect(script).toContain('procedure RemoveSelectedUserData();');
    expect(script).toContain('if not RemoveUserData then');
    expect(script).toContain(
      'if UserDataDirectory <> GetDefaultUserDataDirectory() then',
    );
    expect(script).toContain('DelTree(UserDataDirectory, True, True, True)');
    expect(script).toContain('卸载已取消');
  });

  it('allows choosing an install directory without recursively deleting it', () => {
    expect(script).toContain('DisableDirPage=no');
    expect(script).toContain('DirExistsWarning=yes');
    expect(script).toContain('AppendDefaultDirName=yes');
    expect(script).toContain('PrivilegesRequired=admin');
    expect(script).toContain('DefaultDirName={autopf}\\Media Notes Workbench');
    expect(script).not.toContain('WizardResizable=');
    expect(script).toContain('AllowRootDirectory=no');
    expect(script).toContain(
      'DestName: ".media-notes-workbench-install-marker"; Flags: ignoreversion uninsneveruninstall',
    );
    expect(script).not.toContain('[UninstallDelete]');
    expect(script).not.toContain('Type: filesandordirs; Name: "{app}"');
  });

  it('does not exclude nested node_modules tools directories from the install', () => {
    expect(script).not.toContain('Excludes: "tools\\\\*"');
    expect(script).not.toContain(
      'Source: "../app/tools/*"; DestDir: "{app}\\\\tools"',
    );
    expect(script).toContain(
      'Source: "../app/*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs',
    );
  });

  it('allows only supported Windows 10 and 11 native x64 systems', () => {
    expect(script).toContain('MinVersion=10.0');
    expect(script).toContain(
      'ArchitecturesAllowed=x64compatible and not arm64',
    );
    expect(script).not.toContain('SetupArchitecture=');
    expect(script).toContain(
      'WindowsVersionNotSupported=Media Notes Workbench requires 64-bit Windows 10 or 11.',
    );
  });

  it('uses fast compression by default and allows a validated override', () => {
    expect(script).toContain('Compression=lzma2/fast');
    expect(script).toContain('SolidCompression=no');

    const fastScript = buildInstallerScript({
      sourcePath: '../app',
      version: '2.2.5',
      compression: 'fast',
    });
    expect(fastScript).toContain('Compression=lzma2/fast');
    expect(fastScript).toContain('SolidCompression=no');
    const compactScript = buildInstallerScript({
      sourcePath: '../app',
      version: '2.2.5',
      compression: 'normal',
      solidCompression: true,
    });
    expect(compactScript).toContain('SolidCompression=yes');
    expect(() =>
      buildInstallerScript({
        sourcePath: '../app',
        version: '2.2.5',
        compression: 'unsafe',
      }),
    ).toThrow('compression must be one of');
  });

  it('normalizes and embeds the verified absolute source and icon paths', () => {
    const absoluteScript = buildInstallerScript({
      sourcePath: 'D:\\build output\\app',
      iconPath: 'D:\\build output\\app\\dist\\client\\app-icon.ico',
      version: '2.2.5',
    });

    expect(absoluteScript).toContain(
      'SetupIconFile="D:/build output/app/dist/client/app-icon.ico"',
    );
    expect(absoluteScript).toContain(
      'Source: "D:/build output/app/*"; DestDir: "{app}"',
    );
  });
});
