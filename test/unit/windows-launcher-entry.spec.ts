import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Windows launcher entry', () => {
  const root = resolve(__dirname, '../..');

  it('opens the visible progress launcher instead of starting the service hidden', () => {
    const script = readFileSync(
      resolve(root, '启动多媒体笔记工作台.cmd'),
      'utf8',
    );

    expect(script).toMatch(/workbench-launcher\.hta/i);
    expect(script).toMatch(/start "" \/wait "%MSHTA%" "%LAUNCHER%" start/i);
    expect(script).not.toMatch(/run-hidden\.vbs[\s\S]*start:windows/i);
  });

  it('waits for verified services and the browser render acknowledgement before closing', () => {
    const launcher = readFileSync(resolve(root, 'scripts', 'workbench-launcher.hta'), 'utf8');

    expect(launcher).toContain('launcher-ui-ready.token');
    expect(launcher).toContain('servicesReady && !browserLaunchObserved');
    expect((launcher.match(/browserLaunchObserved && uiReady/g) || []).length).toBe(2);
    expect(launcher).toContain('等待浏览器完成页面渲染');
    expect(launcher).not.toContain('complete("启动完成，正在打开工作台", true)');
    expect(launcher).not.toContain('complete("重启完成，正在打开工作台", true)');
  });

  it('makes the mounted React layout acknowledge the one-time launcher token', () => {
    const layout = readFileSync(resolve(root, 'client', 'src', 'components', 'Layout.tsx'), 'utf8');

    expect(layout).toContain('/api/runtime/launcher-ready?token=');
    expect(layout).toContain('window.requestAnimationFrame');
    expect(layout).toContain('data-launcher-page-ready="true"');
  });
});
