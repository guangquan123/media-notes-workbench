import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  DEFAULT_LOCAL_RUNTIME_CONFIG,
  ensureLocalRuntimeConfig,
}: {
  DEFAULT_LOCAL_RUNTIME_CONFIG: Record<string, unknown>;
  ensureLocalRuntimeConfig: (rootDir: string) => {
    configPath: string;
    created: boolean;
  };
} = require('../../scripts/local-runtime-config.js');

describe('Windows local runtime config', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'media-notes-runtime-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('creates the default local config only when it is missing', () => {
    const result = ensureLocalRuntimeConfig(rootDir);

    expect(result.created).toBe(true);
    expect(JSON.parse(readFileSync(result.configPath, 'utf8'))).toEqual(
      DEFAULT_LOCAL_RUNTIME_CONFIG,
    );
  });

  it('keeps an existing local config byte-for-byte unchanged', () => {
    const configPath = join(rootDir, '.runtime-config.json');
    const existing = '{\n  "mode": "local",\n  "custom": true\n}\n';
    writeFileSync(configPath, existing, 'utf8');

    const result = ensureLocalRuntimeConfig(rootDir);

    expect(result.created).toBe(false);
    expect(readFileSync(configPath, 'utf8')).toBe(existing);
  });

  it('refuses to overwrite an existing non-local config', () => {
    const configPath = join(rootDir, '.runtime-config.json');
    const existing = '{"mode":"miaoda"}\n';
    writeFileSync(configPath, existing, 'utf8');

    expect(() => ensureLocalRuntimeConfig(rootDir)).toThrow(
      '现有运行配置不是 local 模式',
    );
    expect(readFileSync(configPath, 'utf8')).toBe(existing);
  });
});
