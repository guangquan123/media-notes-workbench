import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Windows launcher action routing', () => {
  const root = resolve(__dirname, '../..');
  const entryPoints = [
    ['启动多媒体笔记工作台.cmd', 'start'],
    ['停止多媒体笔记工作台.cmd', 'stop'],
    ['重启多媒体笔记工作台.cmd', 'restart'],
  ] as const;

  it.each(entryPoints)(
    '%s opens the common launcher with the %s action',
    (fileName, action) => {
      const script = readFileSync(resolve(root, fileName), 'utf8');

      expect(script).toMatch(/workbench-launcher\.hta/i);
      expect(script).toContain(`"%LAUNCHER%" ${action}`);
      expect(script).toMatch(/start "" \/wait "%MSHTA%"/i);
    },
  );

  it('rejects a missing or invalid launcher action instead of defaulting to start', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(launcher).toContain('function resolveActionFromCommandLine(commandLine)');
    expect(launcher).toContain('var action = "";');
    expect(launcher).toContain('if (!action) { setFailure("无法识别操作"');
    expect(launcher).not.toContain('var action = "start";');
  });
});
