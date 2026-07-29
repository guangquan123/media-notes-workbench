import { BadRequestException, Injectable } from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import * as TencentCloud from 'tencentcloud-sdk-nodejs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  TencentAsrSettings,
  TencentAsrConnectionStatus,
  UpdateTencentAsrSettingsRequest,
} from '@shared/api.interface';

export interface TencentAsrCredentials {
  asrRegion: string;
  bucket: string;
  enabled: boolean;
  engineModelType: string;
  region: string;
  secretId: string;
  secretKey: string;
  speakerDiarization: boolean;
}

const DEFAULT_ENGINE = '16k_zh_en_2.0';
const DEFAULT_ASR_REGION = 'ap-guangzhou';

@Injectable()
export class TencentAsrSettingsService {
  private readonly configPath = join(process.cwd(), '.tencent-asr-config.json');
  private current: TencentAsrCredentials | undefined;

  async getPublicSettings(): Promise<TencentAsrSettings> {
    const current: TencentAsrCredentials = await this.load();
    return {
      asrRegion: current.asrRegion,
      bucket: current.bucket,
      configured: this.isConfigured(current),
      enabled: current.enabled,
      engineModelType: current.engineModelType,
      region: current.region,
      secretId: maskSecretId(current.secretId),
      secretKeyConfigured: Boolean(current.secretKey),
      speakerDiarization: current.speakerDiarization,
    };
  }

  async getCredentials(): Promise<TencentAsrCredentials | undefined> {
    const current: TencentAsrCredentials = await this.load();
    return current.enabled && this.isConfigured(current) ? current : undefined;
  }

  async update(input: UpdateTencentAsrSettingsRequest): Promise<TencentAsrSettings> {
    const current: TencentAsrCredentials = await this.load();
    const next: TencentAsrCredentials = {
      asrRegion: input.asrRegion?.trim() || current.asrRegion,
      bucket: input.bucket.trim(),
      enabled: input.enabled,
      engineModelType: input.engineModelType?.trim() || DEFAULT_ENGINE,
      region: input.region.trim(),
      secretId: input.secretId.trim() || current.secretId,
      secretKey: input.secretKey?.trim() || current.secretKey,
      speakerDiarization: input.speakerDiarization ?? true,
    };
    if (next.enabled && !this.isConfigured(next)) {
      throw new BadRequestException('启用前请填写 SecretId、SecretKey、地域和存储桶。');
    }
    if (next.bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(next.bucket)) {
      throw new BadRequestException('COS 存储桶名称格式无效。');
    }
    if (next.region && !/^ap-[a-z0-9-]+$/u.test(next.region)) {
      throw new BadRequestException('腾讯云地域应类似 ap-shanghai。');
    }
    const tempPath = `${this.configPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, this.configPath);
    this.current = next;
    return this.getPublicSettings();
  }

  async testConnection(): Promise<TencentAsrConnectionStatus> {
    const current: TencentAsrCredentials = await this.load();
    if (!this.isConfigured(current)) {
      throw new BadRequestException('请先填写 SecretId、SecretKey、地域和存储桶。');
    }
    const cos = new COS({
      SecretId: current.secretId,
      SecretKey: current.secretKey,
    });
    await cos.headBucket({ Bucket: current.bucket, Region: current.region });
    const asr = new TencentCloud.asr.v20190614.Client({
      credential: {
        secretId: current.secretId,
        secretKey: current.secretKey,
      },
      region: current.asrRegion,
    });
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
    }).format(new Date());
    await asr.GetUsageByDate({
      BizNameList: ['asr_rec'],
      EndDate: today,
      StartDate: today,
    });
    return {
      asrConnected: true,
      checkedAt: new Date().toISOString(),
      cosConnected: true,
      message: 'COS 存储桶和腾讯云录音文件识别均可访问。',
    };
  }

  private async load(): Promise<TencentAsrCredentials> {
    if (this.current) return this.current;
    try {
      const raw: string = await readFile(this.configPath, 'utf8');
      this.current = normalize(JSON.parse(raw) as Partial<TencentAsrCredentials>);
    } catch {
      this.current = normalize({
        bucket: process.env.TENCENT_COS_BUCKET,
        enabled: process.env.TENCENT_ASR_ENABLED === 'true',
        engineModelType: process.env.TENCENT_ASR_ENGINE_MODEL_TYPE,
        region: process.env.TENCENT_CLOUD_REGION,
        secretId: process.env.TENCENT_SECRET_ID,
        secretKey: process.env.TENCENT_SECRET_KEY,
        speakerDiarization: process.env.TENCENT_ASR_SPEAKER_DIARIZATION !== 'false',
      });
    }
    return this.current;
  }

  private isConfigured(settings: TencentAsrCredentials): boolean {
    return Boolean(settings.secretId && settings.secretKey && settings.region && settings.bucket);
  }
}

function normalize(input: Partial<TencentAsrCredentials>): TencentAsrCredentials {
  return {
    asrRegion: input.asrRegion?.trim() || DEFAULT_ASR_REGION,
    bucket: input.bucket?.trim() || '',
    enabled: input.enabled === true,
    engineModelType: input.engineModelType?.trim() || DEFAULT_ENGINE,
    region: input.region?.trim() || 'ap-shanghai',
    secretId: input.secretId?.trim() || '',
    secretKey: input.secretKey?.trim() || '',
    speakerDiarization: input.speakerDiarization !== false,
  };
}

function maskSecretId(secretId: string): string {
  if (!secretId) return '';
  return secretId.length <= 8 ? '已配置' : `${secretId.slice(0, 4)}••••${secretId.slice(-4)}`;
}
