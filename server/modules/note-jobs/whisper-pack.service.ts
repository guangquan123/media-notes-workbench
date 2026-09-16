import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type {
  WhisperPackInstallResponse,
  WhisperPackStatus,
} from '@shared/api.interface';
import { getLocalCacheDir } from '../../common/utils/local-runtime-paths';
import {
  getWhisperPackPaths,
  isWhisperPackSupported,
  sha256Matches,
  WHISPER_PACK_MANIFEST,
  type WhisperPackPaths,
} from './whisper-pack.utils';

const MAX_BINARY_BYTES = 40 * 1024 * 1024;
const MAX_MODEL_BYTES = 200 * 1024 * 1024;

@Injectable()
export class WhisperPackService {
  private readonly logger = new Logger(WhisperPackService.name);
  private installPromise: Promise<WhisperPackInstallResponse> | null = null;

  async getStatus(): Promise<WhisperPackStatus> {
    const paths: WhisperPackPaths = getWhisperPackPaths();
    const [cliReady, modelReady] = await Promise.all([
      this.fileExists(paths.cliPath),
      this.fileExists(paths.modelPath),
    ]);
    return {
      cliPath: paths.cliPath,
      cliReady,
      modelPath: paths.modelPath,
      modelReady,
      packReady: cliReady && modelReady,
      supported: isWhisperPackSupported(),
      version: WHISPER_PACK_MANIFEST.version,
    };
  }

  async install(): Promise<WhisperPackInstallResponse> {
    if (!isWhisperPackSupported()) {
      throw new BadRequestException(
        '当前系统暂不支持自动安装离线转录包，请使用 Windows x64，或手动准备 whisper-cli 和模型文件。',
      );
    }
    if (this.installPromise) return this.installPromise;
    this.installPromise = this.installInternal().finally((): void => {
      this.installPromise = null;
    });
    return this.installPromise;
  }

  private async installInternal(): Promise<WhisperPackInstallResponse> {
    const current: WhisperPackStatus = await this.getStatus();
    if (current.packReady) {
      return { message: '离线转录包已经安装，无需重复下载。', status: current };
    }

    const cacheDir: string = getLocalCacheDir();
    const temporaryDir: string = await this.createTemporaryDirectory(cacheDir);
    try {
      const archivePath: string = join(temporaryDir, 'whisper-bin.zip');
      const modelPath: string = join(
        temporaryDir,
        WHISPER_PACK_MANIFEST.modelFileName,
      );
      await this.downloadAndVerify(
        WHISPER_PACK_MANIFEST.binaryUrl,
        archivePath,
        WHISPER_PACK_MANIFEST.binarySha256,
        MAX_BINARY_BYTES,
      );
      await this.downloadAndVerify(
        WHISPER_PACK_MANIFEST.modelUrl,
        modelPath,
        WHISPER_PACK_MANIFEST.modelSha256,
        MAX_MODEL_BYTES,
      );

      const extractedDir: string = join(temporaryDir, 'extracted');
      await mkdir(extractedDir, { recursive: true });
      await this.extractArchive(archivePath, extractedDir);
      const cliSourcePath: string | null = await this.findFile(
        extractedDir,
        process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli',
      );
      if (!cliSourcePath) {
        throw new Error('官方压缩包中没有找到 whisper-cli.exe');
      }

      const paths: WhisperPackPaths = getWhisperPackPaths();
      await this.installBinaryDirectory(cliSourcePath, paths.toolsDir);
      await this.installFile(modelPath, paths.modelPath);
      const status: WhisperPackStatus = await this.getStatus();
      if (!status.packReady) {
        throw new Error('文件已部署，但本地环境检测仍未通过');
      }
      return { message: '离线转录包已安装并通过校验。', status };
    } catch (error) {
      const message: string =
        error instanceof Error ? error.message : '未知安装错误';
      this.logger.error(`离线转录包安装失败：${message}`, error instanceof Error ? error.stack : undefined);
      throw new BadRequestException(`离线转录包安装失败：${message}`);
    } finally {
      await rm(temporaryDir, { recursive: true, force: true }).catch(
        (error: unknown): void => {
          const message: string =
            error instanceof Error ? error.message : '未知清理错误';
          this.logger.warn(`离线转录包临时文件清理失败：${message}`);
        },
      );
    }
  }

  private async downloadAndVerify(
    url: string,
    destination: string,
    expectedSha256: string,
    maxBytes: number,
  ): Promise<void> {
    try {
      const response = await axios.get<Readable>(url, {
        maxBodyLength: maxBytes,
        maxContentLength: maxBytes,
        responseType: 'stream',
        timeout: 120_000,
      });
      await pipeline(response.data, createWriteStream(destination));
      const actualSha256: string = await this.hashFile(destination);
      if (!sha256Matches(actualSha256, expectedSha256)) {
        throw new Error(
          `文件校验失败（期望 ${expectedSha256.slice(0, 12)}，实际 ${actualSha256.slice(0, 12)}）`,
        );
      }
    } catch (error) {
      await rm(destination, { force: true }).catch((): void => undefined);
      if (error instanceof Error) throw error;
      throw new Error('下载文件失败');
    }
  }

  private async extractArchive(
    archivePath: string,
    destination: string,
  ): Promise<void> {
    const command: string = process.platform === 'win32' ? 'powershell.exe' : 'unzip';
    const args: string[] =
      process.platform === 'win32'
        ? [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
            archivePath,
            destination,
          ]
        : ['-q', '-o', archivePath, '-d', destination];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer): void => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code: number | null): void => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || '解压离线转录包失败'));
      });
    });
  }

  private async installBinaryDirectory(
    cliSourcePath: string,
    destination: string,
  ): Promise<void> {
    const sourceDirectory: string = join(cliSourcePath, '..');
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    await mkdir(destination, { recursive: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const extension: string = extname(entry.name).toLowerCase();
      if (extension !== '.exe' && extension !== '.dll') continue;
      await this.installFile(
        join(sourceDirectory, entry.name),
        join(destination, basename(entry.name)),
      );
    }
  }

  private async installFile(source: string, destination: string): Promise<void> {
    const temporaryPath: string = `${destination}.${randomUUID()}.part`;
    await mkdir(join(destination, '..'), { recursive: true });
    try {
      await copyFile(source, temporaryPath);
      await rename(temporaryPath, destination);
    } finally {
      await rm(temporaryPath, { force: true }).catch((): void => undefined);
    }
  }

  private async findFile(
    directory: string,
    targetName: string,
  ): Promise<string | null> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path: string = join(directory, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) {
        return path;
      }
      if (entry.isDirectory()) {
        const nested: string | null = await this.findFile(path, targetName);
        if (nested) return nested;
      }
    }
    return null;
  }

  private async createTemporaryDirectory(parent: string): Promise<string> {
    await mkdir(parent, { recursive: true });
    const path: string = join(parent, `whisper-pack-${randomUUID()}`);
    await mkdir(path, { recursive: true });
    return path;
  }

  private async fileExists(path: string): Promise<boolean> {
    return access(path)
      .then((): boolean => true)
      .catch((): boolean => false);
  }

  private async hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  }
}
