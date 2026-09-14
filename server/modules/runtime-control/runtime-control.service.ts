import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type {
  RuntimeControlOperation,
  RuntimeControlStatus,
  StopRuntimeRequest,
} from '@shared/api.interface';
import { getLocalRuntimePaths } from '../../common/utils/local-runtime-paths';
import { NoteJobsService } from '../note-jobs/note-jobs.service';
import { isLocalRuntime } from '../runtime/runtime.config';

const DRAIN_POLL_INTERVAL_MS = 1_000;
const DRAIN_TIMEOUT_MS = 30 * 60 * 1_000;
const CONTROL_START_DELAY_MS = 500;

@Injectable()
export class RuntimeControlService {
  private readonly logger = new Logger(RuntimeControlService.name);
  private state: 'ready' | 'draining' | 'stopping' = 'ready';
  private drainTimer: NodeJS.Timeout | undefined;
  private drainStartedAt = 0;

  constructor(private readonly noteJobsService: NoteJobsService) {}

  getStatus(): RuntimeControlStatus {
    const activeTaskCount: number = isLocalRuntime()
      ? this.noteJobsService.getActiveTaskCount()
      : 0;
    return {
      activeTaskCount,
      canStopImmediately: isLocalRuntime() && this.state !== 'stopping',
      scheduledStop: this.state === 'draining',
      state: this.state,
    };
  }

  requestStop(input: StopRuntimeRequest): RuntimeControlOperation {
    this.assertLocalRuntime();
    if (this.state === 'stopping') {
      return { operationId: randomUUID(), status: 'stopping' };
    }
    if (input.mode === 'after_tasks') {
      if (this.state === 'draining') {
        return { operationId: randomUUID(), status: 'draining' };
      }
      this.state = 'draining';
      this.drainStartedAt = Date.now();
      this.scheduleDrainCheck();
      return { operationId: randomUUID(), status: 'draining' };
    }
    this.cancelDrainTimer();
    this.state = 'stopping';
    this.scheduleProcessCommand('stop');
    return { operationId: randomUUID(), status: 'accepted' };
  }

  requestRestart(): RuntimeControlOperation {
    this.assertLocalRuntime();
    if (this.state === 'stopping') {
      throw new BadRequestException('工作台正在停止，请稍后再重启');
    }
    const activeTaskCount: number = this.noteJobsService.getActiveTaskCount();
    if (activeTaskCount > 0) {
      throw new BadRequestException(
        `当前有 ${activeTaskCount} 个任务正在处理，请等待任务完成后再重启`,
      );
    }
    this.cancelDrainTimer();
    this.state = 'stopping';
    this.scheduleProcessCommand('restart');
    return { operationId: randomUUID(), status: 'accepted' };
  }

  cancelScheduledStop(): RuntimeControlStatus {
    this.assertLocalRuntime();
    if (this.state !== 'draining') return this.getStatus();
    this.cancelDrainTimer();
    this.state = 'ready';
    this.drainStartedAt = 0;
    return this.getStatus();
  }

  private scheduleDrainCheck(): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout((): void => {
      this.drainTimer = undefined;
      const activeTaskCount: number = this.noteJobsService.getActiveTaskCount();
      if (activeTaskCount === 0 || Date.now() - this.drainStartedAt >= DRAIN_TIMEOUT_MS) {
        this.state = 'stopping';
        this.scheduleProcessCommand('stop');
        return;
      }
      this.scheduleDrainCheck();
    }, DRAIN_POLL_INTERVAL_MS);
  }

  private scheduleProcessCommand(command: 'restart' | 'stop'): void {
    const runtimePaths = getLocalRuntimePaths();
    const scriptName: string = command === 'restart' ? 'restart-windows.js' : 'stop.js';
    const scriptPath: string = join(runtimePaths.appRoot, 'scripts', scriptName);
    const runtimeNode: string =
      process.env.WORKBENCH_RUNTIME_NODE || process.execPath;
    setTimeout((): void => {
      try {
        const child = spawn(runtimeNode, [scriptPath], {
          cwd: runtimePaths.appRoot,
          detached: true,
          env: { ...process.env },
          stdio: 'ignore',
          windowsHide: true,
        });
        child.once('error', (error: Error): void => {
          this.logger.error(
            `无法启动${command === 'stop' ? '停止' : '重启'}协调脚本：${error.message}`,
          );
          this.state = 'ready';
        });
        child.unref();
      } catch (error) {
        const message: string = error instanceof Error ? error.message : String(error);
        this.logger.error(`无法启动${command === 'stop' ? '停止' : '重启'}协调脚本：${message}`);
        this.state = 'ready';
      }
    }, CONTROL_START_DELAY_MS);
  }

  private assertLocalRuntime(): void {
    if (!isLocalRuntime()) {
      throw new BadRequestException('当前运行模式不支持本机工作台控制');
    }
  }

  private cancelDrainTimer(): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = undefined;
    this.drainStartedAt = 0;
  }
}
