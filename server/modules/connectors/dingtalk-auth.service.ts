import { Injectable, Logger } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface DingTalkAuthInitiate {
  verificationUrl: string;
  userCode: string;
  expiresIn: number;
}

export interface DingTalkAuthComplete {
  completed: boolean;
  message: string;
}

@Injectable()
export class DingTalkAuthService {
  private readonly logger = new Logger(DingTalkAuthService.name);
  private activeProcess: ChildProcess | undefined;

  async initiate(): Promise<DingTalkAuthInitiate> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.cli(), [
        'auth', 'login', '--device', '--format', 'json',
      ], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.activeProcess = child;
      let stdout = ''; let stderr = '';
      const timer = setTimeout(() => {
        if (!resolved) reject(new Error('钉钉授权发起超时'));
      }, 30000);
      let resolved = false;
      const done = (value: DingTalkAuthInitiate) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(value);
      };
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        const userCodeMatch = stdout.match(/user_code=([A-Z0-9-]+)/iu) || stdout.match(/authorization code:\s*([A-Z0-9-]+)/iu);
        if (userCodeMatch) {
          const userCode = userCodeMatch[1];
          done({ verificationUrl: `https://login.dingtalk.com/oauth2/device/verify.htm?user_code=${userCode}`, userCode, expiresIn: 900 });
        }
      });
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('error', (error) => { clearTimeout(timer); if (!resolved) reject(error); });
      child.on('close', (code) => { clearTimeout(timer); if (!resolved && code !== 0) reject(new Error(stderr.trim() || '钉钉授权发起失败')); });
    });
  }

  async complete(): Promise<DingTalkAuthComplete> {
    try {
      const result = await this.run(this.cli(), [
        'auth', 'status', '--format', 'json',
      ]);
      const parsed = this.parseJson<{ authenticated?: boolean }>(result.stdout);
      if (parsed.authenticated === true) {
        return { completed: true, message: '钉钉授权成功' };
      }
      return { completed: false, message: '等待授权' };
    } catch (error) {
      const message = error instanceof Error ? error.message : '等待授权';
      return { completed: false, message };
    }
  }

  private cli(): string {
    return process.platform === 'win32' ? 'dws.cmd' : 'dws';
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
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve({ stdout, stderr }); else reject(new Error(stderr.trim() || stdout.trim() || `${command} 执行失败`)); });
    });
  }
}
