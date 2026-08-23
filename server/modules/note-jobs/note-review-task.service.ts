import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { buildReviewTaskPayload } from './note-review-task.utils';
import { getCliEnvironment, resolveCliInvocation } from '../../common/utils/cli-command';

interface CommandResult {
  stderr: string;
  stdout: string;
}

interface CreateReviewTaskInput {
  documentUrl: string;
  jobId: string;
  larkOpenId: string;
  title: string;
}

interface TaskCliResponse {
  data?: { task?: { guid?: string; url?: string } };
  error?: { hint?: string; message?: string };
  ok?: boolean;
  task?: { guid?: string; url?: string };
}

export interface CreatedReviewTask {
  guid: string;
  url: string | null;
}

@Injectable()
export class NoteReviewTaskService {
  private readonly logger = new Logger(NoteReviewTaskService.name);

  async create(input: CreateReviewTaskInput): Promise<CreatedReviewTask> {
    const payload = buildReviewTaskPayload({ ...input, now: new Date() });
    const result = await this.runCommand('lark-cli', [
      'task',
      'tasks',
      'create',
      '--as',
      'user',
      '--user-id-type',
      'open_id',
      '--data',
      JSON.stringify(payload),
      '--json',
    ]);
    const parsed = this.parseResponse(result.stdout);
    const task = parsed.task || parsed.data?.task;
    if (!task?.guid) {
      throw new Error(
        parsed.error?.hint || parsed.error?.message || '飞书待处理任务创建失败',
      );
    }
    return { guid: task.guid, url: task.url || null };
  }

  async complete(taskGuid: string): Promise<void> {
    await this.runCommand('lark-cli', [
      'task',
      '+complete',
      '--as',
      'user',
      '--task-id',
      taskGuid,
      '--json',
    ]);
  }

  private parseResponse(stdout: string): TaskCliResponse {
    try {
      return JSON.parse(stdout) as TaskCliResponse;
    } catch {
      this.logger.warn('飞书任务返回内容无法解析为 JSON');
      return {};
    }
  }

  private runCommand(command: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const invocation = resolveCliInvocation(command, args);
      const child = spawn(invocation.command, invocation.args, {
        cwd: process.cwd(),
        env: getCliEnvironment(),
        windowsHide: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ stderr, stdout });
          return;
        }
        reject(new Error(stderr.trim() || stdout.trim() || `${command} 执行失败`));
      });
    });
  }
}
