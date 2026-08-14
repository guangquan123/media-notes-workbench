import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { KeyFrame } from './frame-extraction.service';
import { resolveCliInvocation } from '../../common/utils/cli-command';

type CommandResult = { stderr: string; stdout: string };

interface FrameUploadCommand {
  args: string[];
  cwd: string;
}

@Injectable()
export class FrameUploadService {
  private readonly logger = new Logger(FrameUploadService.name);

  async uploadFrames(frames: KeyFrame[]): Promise<KeyFrame[]> {
    if (frames.length === 0) return [];
    const result = [...frames];
    const concurrency = 3;
    for (let start = 0; start < frames.length; start += concurrency) {
      const indexes = frames
        .slice(start, start + concurrency)
        .map((_, offset) => start + offset);
      await Promise.all(
        indexes.map(async (index) => {
          try {
            const image = await readFile(frames[index].filePath);
            result[index] = {
              ...frames[index],
              previewDataUrl: `data:image/png;base64,${image.toString('base64')}`,
              imageKey: await this.uploadSingleFrame(frames[index].filePath),
            };
          } catch (error) {
            try {
              const image = await readFile(frames[index].filePath);
              result[index] = {
                ...frames[index],
                previewDataUrl: `data:image/png;base64,${image.toString('base64')}`,
              };
            } catch {
              // The upload error below remains the primary failure evidence.
            }
            this.logger.warn(
              `截图 ${index + 1}/${frames.length} 上传失败: ${String(error)}`,
            );
          }
        }),
      );
    }
    this.logger.log(
      `截图上传完成: ${result.filter((frame) => frame.imageKey).length}/${frames.length}`,
    );
    return result;
  }

  private async uploadSingleFrame(filePath: string): Promise<string> {
    const uploadCommand = buildFrameUploadCommand(filePath);
    const commandResult = await runCommand(
      'lark-cli',
      uploadCommand.args,
      uploadCommand.cwd,
    );
    const response = JSON.parse(commandResult.stdout) as {
      code?: number;
      data?: { image_key?: string };
      error?: { message?: string };
      ok?: boolean;
    };
    const imageKey = response.data?.image_key;
    if (!imageKey || response.ok === false || (response.code ?? 0) !== 0) {
      throw new Error(
        response.error?.message || commandResult.stderr || '未返回 image_key',
      );
    }
    return imageKey;
  }
}

function buildFrameUploadCommand(filePath: string): FrameUploadCommand {
  return {
    args: [
      'im',
      'images',
      'create',
      '--as',
      'user',
      '--data',
      JSON.stringify({ image_type: 'message' }),
      '--file',
      `image=${basename(filePath)}`,
      '--format',
      'json',
    ],
    cwd: dirname(filePath),
  };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const invocation = resolveCliInvocation(command, args);
    const childProcess = spawn(invocation.command, invocation.args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: process.platform === 'win32',
      ...(invocation.shell ? { shell: true } : {}),
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    childProcess.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    childProcess.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    childProcess.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) resolve({ stderr, stdout });
      else reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
    childProcess.on('error', reject);
  });
}

export { buildFrameUploadCommand };
