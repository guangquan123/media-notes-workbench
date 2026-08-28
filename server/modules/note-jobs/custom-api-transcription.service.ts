import { Injectable, Logger } from '@nestjs/common';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { TranscriptionOptions } from '@shared/api.interface';
import type { TranscriptSegment } from './paired-media.utils';
import {
  ModelProviderSettingsService,
  type ModelProviderCredentials,
} from './model-provider-settings.service';

const TRANSCRIPTION_TIMEOUT_MS = 15 * 60_000;
const TRANSCRIPTION_POLL_INTERVAL_MS = 2_000;

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
    const endpoint: string = `${credentials.baseUrl}/audio/transcriptions/async`;
    const timeout = setTimeout((): void => {
      timedOut = true;
      controller.abort();
    }, TRANSCRIPTION_TIMEOUT_MS);
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
      const resultBody: unknown = extractTranscript(body)
        ? body
        : await waitForAsyncTranscript(
            endpoint,
            credentials.baseUrl,
            extractTaskId(body, response.headers),
            credentials.apiKey,
            controller.signal,
            (message: string): void => input.onProgress?.(message),
          );
      const transcript: string = extractTranscript(resultBody);
      if (!transcript) throw new Error('自定义 API 未返回可用转录文本');
      const segments: TranscriptSegment[] = extractSegments(resultBody);
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

async function waitForAsyncTranscript(
  endpoint: string,
  baseUrl: string,
  taskId: string | undefined,
  apiKey: string,
  signal: AbortSignal,
  onProgress: (message: string) => void,
): Promise<unknown> {
  if (!taskId) {
    throw new Error('自定义 API 异步转录未返回任务 ID');
  }
  const pollUrls: string[] = [
    `${endpoint}/${encodeURIComponent(taskId)}`,
    `${baseUrl}/audio/tasks/${encodeURIComponent(taskId)}`,
  ];
  let pollUrl: string | undefined;
  for (let attempt = 0; attempt < 450; attempt += 1) {
    if (signal.aborted) throw new Error('自定义 API 异步转录请求已取消');
    if (!pollUrl) {
      for (const candidate of pollUrls) {
        const response: Response = await fetch(candidate, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
          method: 'GET',
          signal,
        });
        const body: unknown = await readResponseBody(response);
        if (response.status === 404 || response.status === 405) continue;
        if (!response.ok) {
          throw new Error(`查询异步转录任务失败 HTTP ${response.status}：${formatBody(body)}`);
        }
        pollUrl = candidate;
        if (extractTranscript(body)) return body;
        assertAsyncTaskState(body);
        onProgress('API 转录任务已提交，正在等待识别结果…');
        break;
      }
      if (!pollUrl) throw new Error('未找到 Deepexi 异步转录任务查询接口');
    } else {
      const response: Response = await fetch(pollUrl, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
        method: 'GET',
        signal,
      });
      const body: unknown = await readResponseBody(response);
      if (!response.ok) {
        throw new Error(`查询异步转录任务失败 HTTP ${response.status}：${formatBody(body)}`);
      }
      if (extractTranscript(body)) return body;
      assertAsyncTaskState(body);
      onProgress(`API 转录任务处理中（第 ${attempt + 1} 次查询）…`);
    }
    await delay(TRANSCRIPTION_POLL_INTERVAL_MS, signal);
  }
  throw new Error('自定义 API 异步转录等待超时（15 分钟）');
}

function assertAsyncTaskState(body: unknown): void {
  const status: string = extractTaskStatus(body);
  if (/^(failed|error|cancelled|canceled)$/u.test(status)) {
    throw new Error(`自定义 API 异步转录任务失败：${formatBody(body)}`);
  }
}

function extractTaskId(body: unknown, headers: Headers): string | undefined {
  const headerId: string | null =
    headers.get('x-task-id') || headers.get('x-job-id') || headers.get('location');
  if (headerId) return headerId.split('/').pop() || headerId;
  if (!body || typeof body !== 'object') return undefined;
  const value = body as Record<string, unknown>;
  const directKeys: string[] = ['task_id', 'taskId', 'job_id', 'jobId', 'id'];
  for (const key of directKeys) {
    if (typeof value[key] === 'string' && value[key]) return value[key];
  }
  for (const key of ['data', 'result', 'output']) {
    const nested: string | undefined = extractTaskId(value[key], new Headers());
    if (nested) return nested;
  }
  return undefined;
}

function extractTaskStatus(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const value = body as Record<string, unknown>;
  for (const key of ['status', 'state']) {
    if (typeof value[key] === 'string') return value[key].toLowerCase();
  }
  for (const key of ['data', 'result', 'output']) {
    const nested: string = extractTaskStatus(value[key]);
    if (nested) return nested;
  }
  return '';
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject): void => {
    const timer: NodeJS.Timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', (): void => {
      clearTimeout(timer);
      reject(new Error('自定义 API 异步转录请求已取消'));
    }, { once: true });
  });
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
  const value = body as Record<string, unknown>;
  for (const key of ['text', 'transcript']) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return value[key].trim();
    }
  }
  for (const key of ['data', 'result', 'output']) {
    const nested: string = extractTranscript(value[key]);
    if (nested) return nested;
  }
  const choices: unknown = value.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const nested: string = extractTranscript(choice);
      if (nested) return nested;
    }
  }
  if (typeof value.content === 'string') return value.content.trim();
  if (value.message && typeof value.message === 'object') {
    return extractTranscript(value.message);
  }
  return '';
}

function extractSegments(body: unknown): TranscriptSegment[] {
  if (!body || typeof body !== 'object') return [];
  const value = body as Record<string, unknown>;
  const segments: unknown = value.segments
    || (value.data && typeof value.data === 'object'
      ? (value.data as Record<string, unknown>).segments
      : undefined)
    || (value.result && typeof value.result === 'object'
      ? (value.result as Record<string, unknown>).segments
      : undefined);
  if (!Array.isArray(segments)) return [];
  return segments.flatMap((item: unknown): TranscriptSegment[] => {
    if (!item || typeof item !== 'object') return [];
    const segment = item as Record<string, unknown>;
    if (typeof segment.text !== 'string' || !segment.text.trim()) return [];
    const hasMillisecondFields: boolean =
      segment.start_time_ms !== undefined || segment.end_time_ms !== undefined;
    const startMs: number = toMilliseconds(
      segment.start_time_ms ?? segment.start,
      hasMillisecondFields,
    );
    const endMs: number = Math.max(
      startMs,
      toMilliseconds(segment.end_time_ms ?? segment.end, hasMillisecondFields),
    );
    return [{ endMs, startMs, text: segment.text.trim() }];
  });
}

function toMilliseconds(value: unknown, alreadyMilliseconds = false): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(alreadyMilliseconds ? value : value * 1_000))
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
