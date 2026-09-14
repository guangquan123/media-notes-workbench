import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupStateService } from '../../server/modules/setup/setup-state.service';

describe('setup state', () => {
  it('persists progress, validation fingerprints, and completion without credentials', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'setup-state-'));
    const statePath = join(baseDir, '.setup-state.json');
    try {
      const service = new SetupStateService(statePath);
      await service.updateProgress({
        currentStep: 'connector',
        selectedCapabilities: ['documents', 'documents', 'local_audio'],
      });
      await service.recordValidation({
        configFingerprint: 'sha256:summary',
        detail: '模型验证通过。',
        kind: 'summary',
        status: 'success',
        validatedAt: '2026-09-12T00:00:00.000Z',
      });
      await service.markCompleted();

      const persisted = JSON.parse(await readFile(statePath, 'utf8')) as {
        selectedCapabilities: string[];
        status: string;
        validations: Array<{ configFingerprint: string }>;
      };
      expect(persisted.selectedCapabilities).toEqual(['documents', 'local_audio']);
      expect(persisted.currentStep).toBe('review');
      expect(persisted.status).toBe('completed');
      expect(persisted.validations[0]?.configFingerprint).toBe('sha256:summary');
      expect(JSON.stringify(persisted)).not.toContain('apiKey');
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('backs up corrupted state and starts a recoverable new flow', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'setup-state-'));
    const statePath = join(baseDir, '.setup-state.json');
    try {
      await writeFile(statePath, '{ invalid json', 'utf8');
      const service = new SetupStateService(statePath);

      await expect(service.get()).resolves.toEqual(
        expect.objectContaining({
          currentStep: 'welcome',
          status: 'not_started',
        }),
      );
      const entries = await readdir(baseDir);
      expect(
        entries.some((entry: string): boolean =>
          entry.startsWith('.setup-state.json.corrupt-'),
        ),
      ).toBe(true);
      await service.updateProgress({
        currentStep: 'environment',
        selectedCapabilities: ['documents'],
      });
      await expect(readFile(statePath, 'utf8')).resolves.toContain('environment');
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
