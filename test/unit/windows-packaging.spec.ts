import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Windows packaging safeguards', () => {
  const root = resolve(__dirname, '../..');

  it('ships clickable uninstall scripts and protects source directories from cleanup', () => {
    const packager = readFileSync(resolve(root, 'scripts', 'package-windows.js'), 'utf8');

    expect(packager).toContain('function writeUninstallScripts()');
    expect(packager).toContain("path.join(appStage, 'uninstall.cmd')");
    expect(packager).not.toContain('卸载多媒体笔记工作台.cmd');
    expect(packager).toContain('function assertSafeOutputRoot()');
    expect(packager).toContain("relative === '..'");
    expect(packager).toContain("'node_modules'");
    expect(packager).toContain("'dist'");
    expect(packager).toContain('assertSafeOutputRoot();');
  });

  it('ships the installed restart wrapper and its coordinator dependency', () => {
    const packager = readFileSync(resolve(root, 'scripts', 'package-windows.js'), 'utf8');
    const restart = readFileSync(resolve(root, 'scripts', 'restart-windows.js'), 'utf8');

    expect(packager).toContain("'installed-restart.js'");
    expect(packager).toContain("'open-logs.vbs'");
    expect(packager).toContain("'restart-windows.js'");
    expect(restart).toContain("process.env.WORKBENCH_INSTALLED === '1'");
    expect(restart).toContain("'installed-launcher.js'");
  });

  it('removes development-only files without removing native or PDF runtime assets', () => {
    const prune = readFileSync(resolve(root, 'scripts', 'prune-smart.js'), 'utf8');

    expect(prune).toContain("'.d.ts'");
    expect(prune).toContain("'.md'");
    expect(prune).toContain("'.ts'");
    expect(prune).not.toContain("'.bcmap'");
    expect(prune).not.toContain("'.node'");
    expect(prune).not.toContain("'.wasm'");
  });

  it('drops only known non-runtime artifacts from officeparser and TypeScript', () => {
    const prune = readFileSync(resolve(root, 'scripts', 'prune-smart.js'), 'utf8');

    expect(prune).toContain("packageName === 'officeparser'");
    expect(prune).toContain("dist/officeparser.browser.");
    expect(prune).toContain("packageName === 'typescript'");
    expect(prune).toContain("normalizedPath !== 'lib/typescript.js'");
  });

  it('generates a multi-size 32-bit application icon for Explorer and shortcuts', () => {
    const icon = readFileSync(resolve(root, 'client', 'public', 'app-icon.ico'));

    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    expect(icon.readUInt16LE(4)).toBe(4);
    expect([16, 32, 48, 256]).toEqual(
      [0, 1, 2, 3].map((index) => icon[6 + index * 16] || 256),
    );
    expect([0, 1, 2, 3].every((index) => icon.readUInt16LE(6 + index * 16 + 6) === 32)).toBe(true);
  });

});
