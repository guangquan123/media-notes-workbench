import { Injectable, Logger } from '@nestjs/common';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { TranscriptionOptions } from '@shared/api.interface';
import type { TranscriptSegment } from './paired-media.utils';
import {
  ModelProviderSettingsService,
  type ModelProviderCredentials,
} from './model-provider-settings.service';

export interface CustomApiTranscriptResult {
  model: string;
  provider: 'custom_api';
  providerName: string;
  segments: TranscriptSegment[];
  transcript: string;
}

@Injectable()
export class CustomApiTranscriptionService {
  private readonly logger = new Logger(CustomApiTranscriptionService.name);

  constructor(
    private readonly settingsService: ModelProviderSettingsService,
  ) {}

  async isEnabled(): Promise<boolean> {
    return Boolean(await this.settingsService.isCustomTranscriptionReady());
  }

  async transcribe(input: {
    audioPath: string;
    transcriptionOptions?: TranscriptionOptions;
    onProgress?: (message: string) => void;
  }): Promise<CustomApiTranscriptResult> {
    const credentials: ModelProviderCredentials | undefined =
      await this.settingsService.getCredentials('transcription');
    if (!credentials) throw new Error('自定义 API 转录未启用或配置不完整');
    input.onProgress?.(
      `${credentials.providerName} · ${credentials.model} 正在识别音频…`,
    );
    const audio: Buffer = await readFile(input.audioPath);
    const audioBuffer: ArrayBuffer = new ArrayBuffer(audio.byteLength);
    new Uint8Array(audioBuffer).set(audio);
    const form = new FormData();
    form.append(
      'file',
      new Blob([audioBuffer], { type: getAudioContentType(input.audioPath) }),
      basename(input.audioPath),
    );
    form.append('model', credentials.model);
    form.append('response_format', 'verbose_json');
    const hotwords: string[] = input.transcriptionOptions?.hotwords || [];
    if (hotwords.length > 0) form.append('prompt', hotwords.join('、'));
    const controller = new AbortController();
    let timedOut = false;
    const endpoint: string = `${credentials.baseUrl}/audio/transcriptions`;
    const timeout = setTimeout((): void => {
      timedOut = true;
      controller.abort();
    }, 15 * 60_000);
    try {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          body: form,
          headers: { Authorization: `Bearer ${credentials.apiKey}` },
          method: 'POST',
          signal: controller.signal,
        });
      } catch (error) {
        const detail: string = timedOut
          ? '请求超时（15 分钟）'
          : formatTransportError(error);
        const stack: string | undefined =
          error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `自定义 API 转录请求失败：${credentials.providerName} · ${credentials.model} · ${endpoint} · ${detail}`,
          stack,
        );
        throw new Error(
          `自定义 API 转录请求失败（${credentials.providerName} · ${credentials.model}）：${detail}（请求地址：${endpoint}）`,
        );
      }
      const body: unknown = await readResponseBody(response);
      if (!response.ok) {
        throw new Error(
          `服务返回 HTTP ${response.status}（${credentials.providerName} · ${credentials.model}）：${formatBody(body)}`,
        );
      }
      const transcript: string = extractTranscript(body);
      if (!transcript) throw new Error('自定义 API 未返回可用转录文本');
      const segments: TranscriptSegment[] = extractSegments(body);
      this.logger.log(
        JSON.stringify({
          model: credentials.model,
          operation: 'custom_api_transcription',
          provider: credentials.providerName,
          segmentCount: segments.length,
        }),
      );
      return {
        model: credentials.model,
        provider: 'custom_api',
        providerName: credentials.providerName,
        segments: segments.length > 0 ? segments : [{ endMs: 0, startMs: 0, text: transcript }],
        transcript,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function formatTransportError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause: unknown = (error as Error & { cause?: unknown }).cause;
  const code: unknown = (error as Error & { code?: unknown }).code;
  const causeMessage: string = cause instanceof Error ? cause.message : '';
  const causeCode: unknown =
    cause instanceof Error ? (cause as Error & { code?: unknown }).code : undefined;
  const codeValue: unknown = typeof code === 'string' ? code : causeCode;
  const codeMessage: string =
    typeof codeValue === 'string' ? ` [${codeValue}]` : '';
  return `${error.message}${codeMessage}${causeMessage ? `（${causeMessage}）` : ''}`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text: string = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatBody(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 240);
  if (!body || typeof body !== 'object') return '未知错误';
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error.slice(0, 240);
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: string }).message).slice(0, 240);
  }
  return '未知错误';
}

function extractTranscript(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const value = body as { text?: unknown; data?: { text?: unknown } };
  if (typeof value.text === 'string') return value.text.trim();
  return typeof value.data?.text === 'string' ? value.data.text.trim() : '';
}

function extractSegments(body: unknown): TranscriptSegment[] {
  if (!body || typeof body !== 'object') return [];
  const segments: unknown = (body as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return [];
  return segments.flatMap((item: unknown): TranscriptSegment[] => {
    if (!item || typeof item !== 'object') return [];
    const segment = item as { end?: unknown; start?: unknown; text?: unknown };
    if (typeof segment.text !== 'string' || !segment.text.trim()) return [];
    const startMs: number = toMilliseconds(segment.start);
    const endMs: number = Math.max(startMs, toMilliseconds(segment.end));
    return [{ endMs, startMs, text: segment.text.trim() }];
  });
}

function toMilliseconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value * 1_000))
    : 0;
}

function getAudioContentType(audioPath: string): string {
  const extension: string | undefined = basename(audioPath)
    .split('.')
    .pop()
    ?.toLowerCase();
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'm4a' || extension === 'mp4') return 'audio/mp4';
  if (extension === 'ogg') return 'audio/ogg';
  return 'audio/mpeg';
}
