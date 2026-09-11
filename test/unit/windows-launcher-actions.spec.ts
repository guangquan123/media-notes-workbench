import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Windows launcher action routing', () => {
  const root = resolve(__dirname, '../..');
  const entryPoints = [
    ['启动多媒体笔记工作台.vbs', 'start'],
    ['停止多媒体笔记工作台.vbs', 'stop'],
    ['重启多媒体笔记工作台.vbs', 'restart'],
  ] as const;

  it.each(entryPoints)(
    '%s opens the common HTA with the fixed %s action',
    (fileName, action) => {
      const script = readFileSync(resolve(root, fileName), 'utf8');

      expect(script).toContain('scripts\\workbench-launcher.hta');
      expect(script).toContain(`action = "${action}"`);
      expect(script).toContain(
        'htaUrl = "file:///" & Replace(htaPath, "\\", "/") & "#" & action',
      );
      expect(script).toContain(
        'shell.Environment("PROCESS")("WORKBENCH_LAUNCHER_ACTION") = action',
      );
      expect(script).toContain(
        'shell.Run Quote(mshtaPath) & " " & Quote(htaUrl), 1, False',
      );
    },
  );

  it('resolves the action from the local HTA URL before the environment and command-line fallbacks', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(launcher).toContain('singleinstance="no"');
    expect(launcher).toContain('function normalizeAction(value)');
    expect(launcher).toContain('function resolveActionFromLocation()');
    expect(launcher).toContain('window.location.hash');
    expect(launcher).toContain(
      'ExpandEnvironmentStrings("%WORKBENCH_LAUNCHER_ACTION%")',
    );
    expect(launcher).toContain(
      'return resolveActionFromLocation() || normalizeAction(environmentAction) || resolveActionFromCommandLine(oHTA.commandLine);',
    );
  });

  it('uses the native Vite config loader for stable Windows startup', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'dev-windows.js'),
      'utf8',
    );
    const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');

    expect(launcher).toContain("'--configLoader', 'native'");
    expect(viteConfig).toContain('const projectRoot: string = process.cwd();');
    expect(viteConfig).toContain('noDiscovery: stableMode');
  });

  it('rejects a missing or invalid launcher action instead of defaulting to start', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(launcher).toContain('var action = "";');
    expect(launcher).toContain('if (!action) { setFailure("无法识别操作"');
    expect(launcher).not.toContain('var action = "start";');
  });

  it('resolves Node from the Windows PATH before invoking the launcher script', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(launcher).toContain('function resolveNodeExecutable()');
    expect(launcher).toContain('shell.Exec("where.exe node.exe")');
    expect(launcher).toContain('fso.FileExists(candidate)');
    expect(launcher).toContain('shell.Run(quote(node) + " " + quote(');
  });
});
