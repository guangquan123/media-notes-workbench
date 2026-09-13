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

  it('waits for a temporary Node stop command before deleting installed files', () => {
    const uninstallRun = script.split('[UninstallRun]')[1] || '';

    expect(uninstallRun).toContain(
      'Filename: "{sys}\\wscript.exe"',
    );
    expect(uninstallRun).toContain(
      'Parameters: """{app}\\scripts\\run-hidden.vbs"" ""{app}\\runtime\\node.exe"" ""{app}\\scripts\\installed-stop.js"""',
    );
    expect(uninstallRun).toContain('Flags: runhidden waituntilterminated');
    expect(uninstallRun).toContain('RunOnceId: "StopWorkbench"');
  });

  it('allows choosing an install directory without recursively deleting it', () => {
    expect(script).toContain('DisableDirPage=no');
    expect(script).toContain('DirExistsWarning=yes');
    expect(script).toContain('AppendDefaultDirName=yes');
    expect(script).toContain('PrivilegesRequired=admin');
    expect(script).toContain('DefaultDirName={autopf}\\Media Notes Workbench');
    expect(script).toContain('AllowRootDirectory=no');
    expect(script).toContain(
      'DestName: ".media-notes-workbench-install-marker"; Flags: ignoreversion uninsneveruninstall',
    );
    expect(script).not.toContain('[UninstallDelete]');
    expect(script).not.toContain('Type: filesandordirs; Name: "{app}"');
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
