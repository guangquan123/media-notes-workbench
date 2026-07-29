import { Injectable, Logger } from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import * as TencentCloud from 'tencentcloud-sdk-nodejs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { TranscriptSegment } from './paired-media.utils';
import {
  TencentAsrSettingsService,
  type TencentAsrCredentials,
} from './tencent-asr-settings.service';

export interface TencentAsrTranscriptResult {
  provider: 'tencent_asr';
  segments: TranscriptSegment[];
  taskId: string;
  transcript: string;
}

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 180;

@Injectable()
export class TencentAsrTranscriptionService {
  private readonly logger = new Logger(TencentAsrTranscriptionService.name);

  constructor(private readonly settingsService: TencentAsrSettingsService) {}

  async isEnabled(): Promise<boolean> {
    return Boolean(await this.settingsService.getCredentials());
  }

  async transcribe(input: {
    audioPath: string;
    onProgress?: (message: string) => void;
  }): Promise<TencentAsrTranscriptResult> {
    const config: TencentAsrCredentials | undefined =
      await this.settingsService.getCredentials();
    if (!config) throw new Error('腾讯云 ASR 未启用或参数未配置完整');
    const objectKey: string = await this.uploadAudio(input.audioPath, config, input.onProgress);
    const cos: COS = this.createCosClient(config);
    const url: string = cos.getObjectUrl({
      Bucket: config.bucket,
      Expires: 6 * 60 * 60,
      Key: objectKey,
      Method: 'GET',
      Region: config.region,
      Sign: true,
    });
    input.onProgress?.('腾讯云 ASR 大模型正在识别音频…');
    const client = new TencentCloud.asr.v20190614.Client({
      credential: { secretId: config.secretId, secretKey: config.secretKey },
      region: config.asrRegion,
    });
    const created = await client.CreateRecTask({
      ChannelNum: 1,
      ConvertNumMode: 1,
      EngineModelType: config.engineModelType,
      FilterModal: 1,
      ResTextFormat: 3,
      SourceType: 0,
      SpeakerDiarization: config.speakerDiarization ? 1 : 0,
      Url: url,
    });
    const taskId: number | undefined = created.Data?.TaskId;
    if (!taskId) throw new Error('腾讯云 ASR 未返回 TaskId');
    const result = await this.waitForResult(client, taskId, input.onProgress);
    const segments: TranscriptSegment[] = parseTencentSegments(result.ResultDetail);
    const transcript: string = result.Result?.trim() || formatSegments(segments);
    if (!transcript) throw new Error('腾讯云 ASR 返回了空转录结果');
    this.logger.log(JSON.stringify({ operation: 'tencent_asr', segmentCount: segments.length, taskId }));
    return { provider: 'tencent_asr', segments, taskId: String(taskId), transcript };
  }

  private createCosClient(config: TencentAsrCredentials): COS {
    return new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
  }

  private async uploadAudio(
    audioPath: string,
    config: TencentAsrCredentials,
    onProgress?: (message: string) => void,
  ): Promise<string> {
    const [audioStat, file] = await Promise.all([stat(audioPath), readFile(audioPath)]);
    const digest: string = createHash('sha256').update(file).digest('hex');
    const extension: string = basename(audioPath).split('.').pop() || 'mp3';
    const objectKey = `media-notes/asr/${digest}.${extension}`;
    const cos: COS = this.createCosClient(config);
    try {
      await cos.headObject({ Bucket: config.bucket, Key: objectKey, Region: config.region });
      onProgress?.('已复用私有 COS 中的同一份音频…');
      return objectKey;
    } catch {
      onProgress?.('正在上传音频到私有 COS…');
      await cos.putObject({
        Body: createReadStream(audioPath),
        Bucket: config.bucket,
        ContentLength: audioStat.size,
        ContentType: 'audio/mpeg',
        Key: objectKey,
        Region: config.region,
        ServerSideEncryption: 'AES256',
      });
      return objectKey;
    }
  }

  private async waitForResult(
    client: InstanceType<typeof TencentCloud.asr.v20190614.Client>,
    taskId: number,
    onProgress?: (message: string) => void,
  ) {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const response = await client.DescribeTaskStatus({ TaskId: taskId });
      const status = response.Data;
      if (status?.Status === 2) return status;
      if (status?.Status === 3) throw new Error(status.ErrorMsg || '腾讯云 ASR 任务失败');
      onProgress?.('腾讯云 ASR 正在处理，已安全保留原始音频…');
      await new Promise<void>((resolve: () => void) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error('腾讯云 ASR 任务等待超时，请稍后重试');
  }
}

interface TencentSentenceDetail {
  EndMs?: number;
  FinalSentence?: string;
  SliceSentence?: string;
  StartMs?: number;
}

function parseTencentSegments(
  details: readonly TencentSentenceDetail[] | undefined,
): TranscriptSegment[] {
  if (!details) return [];
  return details.flatMap((item: TencentSentenceDetail): TranscriptSegment[] => {
    const text: string = (item.FinalSentence || item.SliceSentence || '').trim();
    if (!text) return [];
    return [{ endMs: item.EndMs || item.StartMs || 0, startMs: item.StartMs || 0, text }];
  });
}

function formatSegments(segments: TranscriptSegment[]): string {
  return segments.map((segment: TranscriptSegment): string => segment.text).join('\n');
}
