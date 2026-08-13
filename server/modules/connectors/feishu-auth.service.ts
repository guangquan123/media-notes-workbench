import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface FeishuAuthInitiate {
  deviceCode: string;
  verificationUrl: string;
  expiresIn: number;
}

export interface FeishuAuthComplete {
  completed: boolean;
  message: string;
}

@Injectable()
export class FeishuAuthService {
  private readonly logger = new Logger(FeishuAuthService.name);

  async initiate(): Promise<FeishuAuthInitiate> {
    const result = await this.run(this.cli(), [
      'auth', 'login', '--no-wait', '--json', '--domain', 'docs,task,drive,im',
    ]);
    const parsed = this.parseJson<{ device_code?: string; verification_url?: string; expires_in?: number; ok?: boolean; error?: { message?: string } }>(result.stdout);
    if (!parsed.device_code || !parsed.verification_url) {
      throw new Error(parsed.error?.message || '飞书授权发起失败');
    }
    return { deviceCode: parsed.device_code, verificationUrl: parsed.verification_url, expiresIn: parsed.expires_in || 600 };
  }

  async complete(deviceCode: string): Promise<FeishuAuthComplete> {
    try {
      const result = await this.run(this.cli(), [
        'auth', 'login', '--device-code', deviceCode, '--json',
      ], 15000);
      const parsed = this.parseJson<{ ok?: boolean; error?: { message?: string } }>(result.stdout);
      if (parsed.ok === false) {
        return { completed: false, message: parsed.error?.message || '等待授权' };
      }
      return { completed: true, message: '飞书授权成功' };
    } catch (error) {
      const message = error instanceof Error ? error.message : '等待授权';
      return { completed: false, message };
    }
  }

  private cli(): string {
    return process.platform === 'win32' ? 'lark-cli.cmd' : 'lark-cli';
  }

  private parseJson<T>(stdout: string): T {
    try {
      return JSON.parse(stdout) as T;
    } catch {
      return {} as T;
    }
  }

  private run(command: string, args: string[], timeoutMs = 30000): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let stdout = ''; let stderr = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve({ stdout, stderr }); else reject(new Error(stderr.trim() || stdout.trim() || `${command} 执行失败`)); });
    });
  }
}
