import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CreateDingTalkTaskInput {
  title: string;
  executorUserId: string;
}

export interface CreatedDingTalkTask {
  guid: string;
  url: string | null;
}

interface DingTalkTaskCreateResponse {
  result?: { taskId?: string };
}

@Injectable()
export class DingTalkTaskService {
  private readonly logger = new Logger(DingTalkTaskService.name);

  async create(input: CreateDingTalkTaskInput): Promise<CreatedDingTalkTask> {
    const result = await this.runCommand(this.cli(), [
      'todo', 'task', 'create', '--title', input.title.slice(0, 120), '--executors', input.executorUserId, '--format', 'json',
    ]);
    const parsed = this.parseJson<DingTalkTaskCreateResponse>(result.stdout);
    const taskId = parsed.result?.taskId;
    if (!taskId) throw new Error(result.stderr.trim() || '钉钉待办创建未返回 taskId');
    return { guid: taskId, url: null };
  }

  async complete(taskGuid: string): Promise<void> {
    await this.runCommand(this.cli(), [
      'todo', 'task', 'done', '--task-id', taskGuid, '--status', 'true', '--format', 'json',
    ]);
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

  private runCommand(command: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('error', reject);
      child.on('close', (code: number | null) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr.trim() || stdout.trim() || `${command} 执行失败`)));
    });
  }
}
