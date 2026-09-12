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
    expect(script).toContain(
      'Name: "{group}\\卸载多媒体笔记工作台"; Filename: "{uninstallexe}"',
    );
  });

  it('waits for the bundled Node stop command before deleting installed files', () => {
    const uninstallRun = script.split('[UninstallRun]')[1] || '';

    expect(uninstallRun).toContain(
      'Filename: "{app}\\runtime\\node.exe"',
    );
    expect(uninstallRun).toContain(
      'Parameters: """{app}\\scripts\\installed-stop.js"""',
    );
    expect(uninstallRun).toContain('Flags: runhidden waituntilterminated');
    expect(uninstallRun).toContain('RunOnceId: "StopWorkbench"');
    expect(uninstallRun).not.toContain('wscript.exe');
    expect(uninstallRun).not.toContain('run-hidden.vbs');
  });

  it('allows only supported Windows 10 and 11 native x64 systems', () => {
    expect(script).toContain('MinVersion=10.0');
    expect(script).toContain(
      'ArchitecturesAllowed=x64compatible and not arm64',
    );
    expect(script).not.toContain('SetupArchitecture=');
    expect(script).toContain(
      'WindowsVersionNotSupported=多媒体笔记工作台仅支持 Windows 10/11 64 位系统。',
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
