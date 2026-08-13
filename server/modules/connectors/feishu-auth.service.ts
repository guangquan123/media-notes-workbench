import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

interface CommandResult { stdout: string; stderr: string; }

export interface FeishuAuthInitiate {
  sessionId: string;
  verificationUrl: string;
  expiresIn: number;
  alreadyAuthenticated: boolean;
  appId: string;
}

export interface FeishuAuthComplete {
  completed: boolean;
  code: 'success' | 'pending' | 'expired';
  message: string;
}

export interface FeishuConnectionTest {
  ok: boolean;
  message: string;
}

export interface FeishuAppInfo {
  appId: string;
  brand: string;
  usingDefault: boolean;
}

const DEFAULT_APP_ID = 'cli_aaee090eb8f85bda';

@Injectable()
export class FeishuAuthService {
  private readonly logger = new Logger(FeishuAuthService.name);
  private readonly sessions = new Map<string, string>();

  private async isAuthenticated(): Promise<boolean> {
    try {
      const result = await this.run(this.cli(), ['auth', 'status', '--json', '--verify']);
      const parsed = this.parseJson<{ identities?: { user?: { available?: boolean; tokenStatus?: string } } }>(result.stdout);
      return parsed.identities?.user?.available === true && parsed.identities.user.tokenStatus === 'valid';
    } catch {
      return false;
    }
  }

  async getAppInfo(): Promise<FeishuAppInfo> {
    try {
      const result = await this.run(this.cli(), ['config', 'show']);
      const parsed = this.parseJson<{ appId?: string; brand?: string }>(result.stdout);
      const appId = parsed.appId || '';
      return { appId, brand: parsed.brand || 'feishu', usingDefault: appId === DEFAULT_APP_ID || !appId };
    } catch {
      return { appId: DEFAULT_APP_ID, brand: 'feishu', usingDefault: true };
    }
  }

  async configureApp(appId: string, appSecret: string): Promise<void> {
    if (!appId?.trim() || !appSecret?.trim()) {
      throw new Error('飞书应用 App ID 和 App Secret 不能为空');
    }
    this.logger.log('正在配置飞书自定义应用…');
    await this.runWithStdin(
      this.cli(),
      ['config', 'init', '--app-id', appId.trim(), '--app-secret-stdin', '--brand', 'feishu', '--force-init'],
      appSecret.trim(),
      30000,
    );
  }

  async initiate(appId?: string, appSecret?: string): Promise<FeishuAuthInitiate> {
    if (appId && appSecret) {
      await this.configureApp(appId, appSecret);
    }

    if (await this.isAuthenticated()) {
      const info = await this.getAppInfo();
      return { sessionId: '', verificationUrl: '', expiresIn: 0, alreadyAuthenticated: true, appId: info.appId };
    }

    const result = await this.run(this.cli(), ['auth', 'login', '--no-wait', '--json', '--domain', 'docs,task,drive,im']);
    const parsed = this.parseJson<{ device_code?: string; verification_url?: string; expires_in?: number; error?: { message?: string; hint?: string } }>(result.stdout);
    if (!parsed.device_code || !parsed.verification_url) {
      throw new Error(parsed.error?.message || '飞书授权发起失败');
    }
    const sessionId = randomUUID();
    this.sessions.set(sessionId, parsed.device_code);
    const info = await this.getAppInfo();
    return {
      sessionId,
      verificationUrl: parsed.verification_url,
      expiresIn: parsed.expires_in || 600,
      alreadyAuthenticated: false,
      appId: info.appId,
    };
  }

  async complete(sessionId: string): Promise<FeishuAuthComplete> {
    const deviceCode = this.sessions.get(sessionId);
    if (!deviceCode) return { completed: false, code: 'expired', message: '授权会话已失效，请重新发起' };
    try {
      const result = await this.run(this.cli(), ['auth', 'login', '--device-code', deviceCode, '--json'], 25000);
      const parsed = this.parseJson<{ ok?: boolean; error?: { message?: string; subtype?: string } }>(result.stdout);
      if (parsed.ok === false) {
        return { completed: false, code: 'pending', message: parsed.error?.message || '等待授权' };
      }
      this.sessions.delete(sessionId);
      return { completed: true, code: 'success', message: '飞书授权成功' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail && !/timeout|SIGKILL|等待授权/i.test(detail)) {
        this.logger.warn(`飞书授权完成检测失败: ${detail}`);
      }
      return { completed: false, code: 'pending', message: '等待授权' };
    }
  }

  async testConnection(): Promise<FeishuConnectionTest> {
    try {
      const result = await this.run(this.cli(), ['auth', 'status', '--json', '--verify']);
      const parsed = this.parseJson<{ identities?: { user?: { available?: boolean; tokenStatus?: string; userName?: string } } }>(result.stdout);
      const user = parsed.identities?.user;
      if (user?.available && user.tokenStatus === 'valid') {
        return { ok: true, message: `飞书连接正常（${user.userName || '已登录'}）` };
      }
      return { ok: false, message: '飞书未登录或授权已失效' };
    } catch {
      return { ok: false, message: '飞书连接测试失败' };
    }
  }

  async logout(): Promise<void> {
    await this.run(this.cli(), ['auth', 'logout']);
  }

  private cli(): string { return process.platform === 'win32' ? 'lark-cli.cmd' : 'lark-cli'; }

  private parseJson<T>(stdout: string): T { try { return JSON.parse(stdout) as T; } catch { return {} as T; } }

  private run(command: string, args: string[], timeoutMs = 30000): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: true });
      let stdout = ''; let stderr = '';
      const timer = setTimeout(() => child.kill(), timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr.trim() || stdout.trim() || `${command} 执行失败`));
      });
    });
  }

  private runWithStdin(command: string, args: string[], stdin: string, timeoutMs = 30000): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: true });
      let stdout = ''; let stderr = '';
      const timer = setTimeout(() => child.kill(), timeoutMs);
      child.stdin.on('error', () => { /* ignore */ });
      child.stdin.write(`${stdin}\n`);
      child.stdin.end();
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr.trim() || stdout.trim() || `${command} 执行失败`));
      });
    });
  }
}
