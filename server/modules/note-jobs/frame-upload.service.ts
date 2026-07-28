import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { KeyFrame } from './frame-extraction.service';

type CommandResult = { stdout: string; stderr: string };

@Injectable()
export class FrameUploadService {
  private readonly logger = new Logger(FrameUploadService.name);
  private cachedToken: string | null = null;
  private tokenExpiry = 0;

  /**
   * 批量上传帧图片到飞书，获取 image_key
   * 并发数 = 3，失败的帧不阻断整体流程
   */
  async uploadFrames(frames: KeyFrame[]): Promise<KeyFrame[]> {
    if (frames.length === 0) return frames;

    this.logger.log(`开始上传 ${frames.length} 张截图到飞书`);

    const CONCURRENCY = 3;
    const result: KeyFrame[] = [...frames];

    // 分批并发上传
    for (let i = 0; i < frames.length; i += CONCURRENCY) {
      const batch = frames.slice(i, i + CONCURRENCY);
      const uploaded = await Promise.all(
        batch.map(async (frame, batchIdx) => {
          const idx = i + batchIdx;
          try {
            const imageKey = await this.uploadSingleFrame(frame.filePath);
            result[idx] = { ...frame, imageKey };
            this.logger.log(`第 ${idx + 1}/${frames.length} 帧上传成功: ${imageKey}`);
          } catch (err) {
            this.logger.warn(`第 ${idx + 1}/${frames.length} 帧上传失败，跳过: ${String(err)}`);
            // 上传失败：imageKey 留空，后续插入时跳过此帧
          }
          return result[idx];
        }),
      );
      // uploaded is used to ensure sequential batch processing
      void uploaded;
    }

    const successCount = result.filter((f) => f.imageKey).length;
    this.logger.log(`截图上传完成：${successCount}/${frames.length} 成功`);
    return result;
  }

  /**
   * 上传单张图片到飞书 IM 图片库
   * 使用飞书开放平台接口：POST /open-apis/im/v1/images
   */
  private async uploadSingleFrame(filePath: string): Promise<string> {
    const token = await this.getAppAccessToken();
    const imageBuffer = await readFile(filePath);

    // 使用 multipart/form-data 上传
    const boundary = `----FormBoundary${Date.now().toString(16)}`;
    const imageTypeLine = `--${boundary}\r\nContent-Disposition: form-data; name="image_type"\r\n\r\nmessage\r\n`;
    const imageFileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="frame.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const closing = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(imageTypeLine, 'utf8'),
      Buffer.from(imageFileHeader, 'utf8'),
      imageBuffer,
      Buffer.from(closing, 'utf8'),
    ]);

    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/images', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    });

    const data = (await response.json()) as {
      code: number;
      msg: string;
      data?: { image_key?: string };
    };

    if (!response.ok || data.code !== 0) {
      throw new Error(`飞书图片上传失败: code=${data.code}, msg=${data.msg}`);
    }

    const imageKey = data.data?.image_key;
    if (!imageKey) throw new Error('飞书图片上传响应中未返回 image_key');
    return imageKey;
  }

  /**
   * 获取飞书 App Access Token
   * 优先使用 lark-cli auth token 命令，失败则使用环境变量
   */
  private async getAppAccessToken(): Promise<string> {
    // 检查缓存是否有效（提前 5 分钟过期）
    if (this.cachedToken && Date.now() < this.tokenExpiry - 5 * 60 * 1000) {
      return this.cachedToken;
    }

    // 方案 A：通过 lark-cli 获取 tenant_access_token
    try {
      const result = await runCommand('lark-cli', ['auth', 'token', '--json']);
      const tokenData = JSON.parse(result.stdout) as {
        ok?: boolean;
        data?: { token?: string; tenant_access_token?: string; app_access_token?: string };
        tenant_access_token?: string;
        app_access_token?: string;
      };
      const token =
        tokenData.data?.tenant_access_token ||
        tokenData.data?.app_access_token ||
        tokenData.tenant_access_token ||
        tokenData.app_access_token ||
        tokenData.data?.token;
      if (token) {
        this.cachedToken = token;
        this.tokenExpiry = Date.now() + 2 * 60 * 60 * 1000; // 2小时缓存
        return token;
      }
    } catch (err) {
      this.logger.warn(`lark-cli auth token 失败: ${String(err)}`);
    }

    // 方案 B：通过环境变量获取
    const appId = process.env.LARK_APP_ID;
    const appSecret = process.env.LARK_APP_SECRET;
    if (appId && appSecret) {
      const token = await this.fetchTokenFromFeishu(appId, appSecret);
      this.cachedToken = token;
      this.tokenExpiry = Date.now() + 2 * 60 * 60 * 1000;
      return token;
    }

    throw new Error('无法获取飞书 token：lark-cli auth token 失败且未配置 LARK_APP_ID/LARK_APP_SECRET');
  }

  private async fetchTokenFromFeishu(appId: string, appSecret: string): Promise<string> {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = (await response.json()) as {
      code: number;
      msg: string;
      tenant_access_token?: string;
    };
    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`飞书 token 获取失败: ${data.msg}`);
    }
    return data.tenant_access_token;
  }
}

async function runCommand(
  command: string,
  args: string[],
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    proc.stdin.end();
    proc.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
    proc.on('error', reject);
  });
}
