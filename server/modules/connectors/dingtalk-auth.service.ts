import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolveCliInvocation } from '../../common/utils/cli-command';

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface DingTalkAuthInitiate {
  sessionId: string;
  verificationUrl: string;
  userCode: string;
  expiresIn: number;
  alreadyAuthenticated: boolean;
  message?: string;
}

export interface DingTalkAuthComplete {
  completed: boolean;
  message: string;
}

export interface DingTalkConnectionTest {
  ok: boolean;
  message: string;
}

export interface DingTalkAuthorizedUser {
  userId: string;
}

interface DingTalkSession {
  process: ChildProcess;
  completed: boolean;
}

@Injectable()
export class DingTalkAuthService {
  private readonly logger = new Logger(DingTalkAuthService.name);
  private readonly sessions = new Map<string, DingTalkSession>();

  async initiate(): Promise<DingTalkAuthInitiate> {
    try {
      const status = await this.run(this.cli(), [
        'auth',
        'status',
        '--format',
        'json',
      ]);
      const statusParsed = this.parseJson<{ authenticated?: boolean }>(
        status.stdout,
      );
      if (statusParsed.authenticated === true) {
        return {
          sessionId: '',
          verificationUrl: '',
          userCode: '',
          expiresIn: 0,
          alreadyAuthenticated: true,
        };
      }
    } catch {
      /* 未登录，继续设备流 */
    }

    return new Promise((resolve, reject) => {
      const invocation = resolveCliInvocation(this.cli(), [
        'auth',
        'login',
        '--device',
        '--format',
        'json',
      ]);
      const child = spawn(invocation.command, invocation.args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const sessionId = randomUUID();
      const session: DingTalkSession = { process: child, completed: false };
      this.sessions.set(sessionId, session);
      let combined = '';
      let resolved = false;

      const tryResolve = (): void => {
        const m = combined.match(/user_code=([A-Z0-9-]+)/iu);
        if (m && !resolved) {
          resolved = true;
          clearTimeout(timer);
          const userCode = m[1];
          resolve({
            sessionId,
            verificationUrl: `https://login.dingtalk.com/oauth2/device/verify.htm?user_code=${userCode}`,
            userCode,
            expiresIn: 900,
            alreadyAuthenticated: false,
          });
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.sessions.delete(sessionId);
          reject(new Error('钉钉授权发起超时'));
        }
      }, 30000);
      child.stdout.on('data', (chunk: Buffer) => {
        combined += chunk.toString('utf8');
        tryResolve();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        combined += chunk.toString('utf8');
        tryResolve();
      });
      child.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.sessions.delete(sessionId);
          reject(error);
        }
      });
      child.on('close', (code) => {
        session.completed = code === 0;
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          this.sessions.delete(sessionId);
          reject(new Error(combined.trim() || '钉钉授权发起失败'));
        }
      });
    });
  }

  async complete(sessionId: string): Promise<DingTalkAuthComplete> {
    // 优先检查真实登录态：后台 CLI 完成兑换后，即使内存 session 被清理也能正确判定成功
    if (await this.isAuthenticated()) {
      this.sessions.delete(sessionId);
      return { completed: true, message: '钉钉授权成功' };
    }
    const session = this.sessions.get(sessionId);
    if (!session)
      return { completed: false, message: '授权会话已失效，请重新发起' };
    if (session.completed) {
      this.sessions.delete(sessionId);
      return { completed: true, message: '钉钉授权成功' };
    }
    return { completed: false, message: '等待授权' };
  }

  async getAuthorizedUser(): Promise<DingTalkAuthorizedUser> {
    const result = await this.run(this.cli(), [
      'contact',
      'user',
      'get-self',
      '--format',
      'json',
    ]);
    const parsed = this.parseJson<{
      result?: { userId?: unknown } | Array<{ userId?: unknown }>;
      userId?: unknown;
    }>(result.stdout);
    const resultUser = Array.isArray(parsed.result)
      ? parsed.result[0]
      : parsed.result;
    const userId =
      this.asNonEmptyString(resultUser?.userId) ||
      this.asNonEmptyString(parsed.userId);
    if (!userId) {
      throw new Error(
        '钉钉授权用户信息未返回 userId，请确认已授予通讯录读取权限后重新授权。',
      );
    }
    return { userId };
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const result = await this.run(this.cli(), [
        'auth',
        'status',
        '--format',
        'json',
      ]);
      const parsed = this.parseJson<{ authenticated?: boolean }>(result.stdout);
      return parsed.authenticated === true;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<DingTalkConnectionTest> {
    try {
      const result = await this.run(this.cli(), [
        'auth',
        'status',
        '--format',
        'json',
      ]);
      const parsed = this.parseJson<{
        authenticated?: boolean;
        user_name?: string;
      }>(result.stdout);
      if (parsed.authenticated === true)
        return {
          ok: true,
          message: `钉钉连接正常（${parsed.user_name || '已登录'}）`,
        };
      return { ok: false, message: '钉钉未登录或授权已失效' };
    } catch {
      return { ok: false, message: '钉钉连接测试失败' };
    }
  }

  async logout(): Promise<void> {
    await this.run(this.cli(), ['auth', 'logout']);
  }

  private cli(): string {
    return process.platform === 'win32' ? 'dws.cmd' : 'dws';
  }

  private asNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private parseJson<T>(stdout: string): T {
    try {
      return JSON.parse(stdout) as T;
    } catch {
      return {} as T;
    }
  }

  private run(
    command: string,
    args: string[],
    timeoutMs = 30000,
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const invocation = resolveCliInvocation(command, args);
      const child = spawn(invocation.command, invocation.args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.stdout.on(
        'data',
        (chunk: Buffer) => (stdout += chunk.toString('utf8')),
      );
      child.stderr.on(
        'data',
        (chunk: Buffer) => (stderr += chunk.toString('utf8')),
      );
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(
            new Error(stderr.trim() || stdout.trim() || `${command} 执行失败`),
          );
      });
    });
  }
}
