import {
  getWhisperPackPaths,
  isWhisperPackSupported,
  sha256Matches,
  WHISPER_PACK_MANIFEST,
} from '../../server/modules/note-jobs/whisper-pack.utils';
import { WhisperPackService } from '../../server/modules/note-jobs/whisper-pack.service';
import type { WhisperPackStatus } from '../../shared/api.interface';

describe('whisper pack', () => {
  it('uses the official pinned sources and hashes', () => {
    expect(WHISPER_PACK_MANIFEST.binaryUrl).toContain(
      'github.com/ggml-org/whisper.cpp/releases/download/b5130/',
    );
    expect(WHISPER_PACK_MANIFEST.modelUrl).toContain(
      'huggingface.co/ggerganov/whisper.cpp/',
    );
    expect(WHISPER_PACK_MANIFEST.binarySha256).toHaveLength(64);
    expect(WHISPER_PACK_MANIFEST.modelSha256).toBe(
      '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
    );
  });

  it('accepts a matching hash and rejects a mismatch', () => {
    expect(sha256Matches('ABC123', 'abc123')).toBe(true);
    expect(sha256Matches('ABC123', 'abc124')).toBe(false);
  });

  it('uses the mutable local data directory for both pack files', () => {
    const paths = getWhisperPackPaths();
    expect(paths.cliPath).toContain('tools');
    expect(paths.modelPath).toContain('models');
    expect(paths.modelPath).toContain('ggml-base-q5_1.bin');
  });

  it('does not download again when the pack is already installed', async () => {
    const service = new WhisperPackService();
    const installed: WhisperPackStatus = {
      cliPath: 'whisper-cli.exe',
      cliReady: true,
      modelPath: 'ggml-base-q5_1.bin',
      modelReady: true,
      packReady: true,
      supported: isWhisperPackSupported(),
      version: WHISPER_PACK_MANIFEST.version,
    };
    jest.spyOn(service, 'getStatus').mockResolvedValue(installed);

    const response = await service.install();

    expect(response.status).toBe(installed);
    expect(response.message).toContain('无需重复下载');
  });
});
