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
});
