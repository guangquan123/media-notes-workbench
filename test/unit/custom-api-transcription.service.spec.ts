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
        'https://models.example.com/v1/audio/transcriptions/async',
      );
      const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect(request.headers).toEqual({ Authorization: 'Bearer secret-key' });
      expect(request.body).toBeInstanceOf(FormData);
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('polls Deepexi async transcription tasks until a transcript is ready', async () => {
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
          model: 'asr-model',
          providerId: provider.id,
          providerName: provider.name,
        },
      });
      const audioPath = join(baseDir, 'sample.wav');
      await writeFile(audioPath, Buffer.from('audio-data'));
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ task_id: 'task-123', status: 'queued' }), {
            status: 202,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'processing' }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                segments: [{ end_time_ms: 900, start_time_ms: 100, text: '异步结果' }],
                text: '异步结果',
              },
              status: 'completed',
            }),
            { status: 200 },
          ),
        );

      await expect(
        new CustomApiTranscriptionService(settings).transcribe({ audioPath }),
      ).resolves.toEqual({
        model: 'asr-model',
        provider: 'custom_api',
        providerName: '测试 Provider',
        segments: [{ endMs: 900, startMs: 100, text: '异步结果' }],
        transcript: '异步结果',
      });
      expect(fetchSpy.mock.calls.map((call: [RequestInfo | URL, RequestInit?]) => call[0])).toEqual([
        'https://models.example.com/v1/audio/transcriptions/async',
        'https://models.example.com/v1/audio/transcriptions/async/task-123',
        'https://models.example.com/v1/audio/transcriptions/async/task-123',
      ]);
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('reports provider, model, endpoint and transport cause on network failure', async () => {
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
          model: 'asr-model',
          providerId: provider.id,
          providerName: provider.name,
        },
      });
      const audioPath = join(baseDir, 'sample.wav');
      await writeFile(audioPath, Buffer.from('audio-data'));
      const transportError = Object.assign(new Error('fetch failed'), {
        cause: Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        }),
      });
      fetchSpy.mockRejectedValue(transportError);

      await expect(
        new CustomApiTranscriptionService(settings).transcribe({ audioPath }),
      ).rejects.toThrow(
        '自定义 API 转录请求失败（测试 Provider · asr-model）：fetch failed [ECONNREFUSED]（connect ECONNREFUSED）（请求地址：https://models.example.com/v1/audio/transcriptions/async）',
      );
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it('explains when async submission succeeds but no task query route is exposed', async () => {
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
          model: 'asr-model',
          providerId: provider.id,
          providerName: provider.name,
        },
      });
      const audioPath = join(baseDir, 'sample.wav');
      await writeFile(audioPath, Buffer.from('audio-data'));
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ task_id: 'task-404', status: 'uploading' }), {
            status: 200,
          }),
        )
        .mockImplementation(async () => new Response('404 page not found', { status: 404 }));

      await expect(
        new CustomApiTranscriptionService(settings).transcribe({ audioPath }),
      ).rejects.toThrow(
        '自定义 API 已接受异步转录任务（task_id: task-404），但供应商未提供可访问的任务查询接口',
      );
      expect(fetchSpy.mock.calls.map((call: [RequestInfo | URL, RequestInit?]) => call[0])).toEqual([
        'https://models.example.com/v1/audio/transcriptions/async',
        'https://models.example.com/v1/audio/transcriptions/async/task-404',
        'https://models.example.com/v1/audio/tasks/task-404',
        'https://models.example.com/v1/tasks/task-404',
        'https://models.example.com/v1/audio/transcriptions/async?task_id=task-404',
      ]);
    } finally {
      fetchSpy.mockRestore();
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});
