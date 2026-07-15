import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface CapabilityConfig {
  formValue: {
    prompt: string;
  };
}

const CAPABILITY_FILES: string[] = [
  'bilibili-note-writer.json',
  'pdf-note-writer.json',
  'note-quality-reviewer.json',
  'pdf-note-quality-reviewer.json',
];

function readCapability(fileName: string): CapabilityConfig {
  const path: string = join(
    process.cwd(),
    'server',
    'capabilities',
    fileName,
  );
  return JSON.parse(readFileSync(path, 'utf8')) as CapabilityConfig;
}

describe('note prompt priority', () => {
  it.each(CAPABILITY_FILES)(
    '%s gives user requirements priority over output format',
    (fileName: string) => {
      const prompt: string = readCapability(fileName).formValue.prompt;

      expect(prompt).toContain('用户提示词优先级最高');
      expect(prompt).not.toContain('输出结构必须包含');
      expect(prompt).not.toContain('增加“## 质量校验”');
    },
  );
});
