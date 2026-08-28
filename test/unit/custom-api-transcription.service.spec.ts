import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CustomApiTranscriptionService } from '../../server/modules/note-jobs/custom-api-transcription.service';
import { ModelProviderSettingsService } from '../../server/modules/note-jobs/model-provider-settings.service';

describe('custom api transcription', () => {
  it('submits audio with the configured model and maps verbose segments', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'custom-api-transcription-'));
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      const settings = new ModelProviderSettingsService(
        join(baseDir, '.model-provider-config.json'),
      );
      const provider = await settings.createProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://models.example.com/v1',
        enabled: true,
        name: '测试 Provider',
      });
      await settings.updateModelSettings({
        summaryModel: undefined,
        transcriptionMode: 'custom_api',
        transcriptionModel: {
          model: 'whisper-1',
          providerId: provider.id,
          providerName: provider.name,
        },
      });
      const audioPath = join(baseDir, 'sample.wav');
      await writeFile(audioPath, Buffer.from('audio-data'));
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            segments: [{ end: 1.5, start: 0.25, text: '你好，世界。' }],
            text: '你好，世界。',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await new CustomApiTranscriptionService(settings).transcribe({
        audioPath,
      });
      expect(result).toEqual({
        model: 'whisper-1',
        provider: 'custom_api',
        providerName: '测试 Provider',
        segments: [{ endMs: 1500, startMs: 250, text: '你好，世界。' }],
        transcript: '你好，世界。',
      });
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        'https://models.example.com/v1/audio/transcriptions',
      );
      const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect(request.headers).toEqual({ Authorization: 'Bearer secret-key' });
      expect(request.body).toBeInstanceOf(FormData);
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
