import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type {
  CreateRecordingAssetRequest,
  RecordingAsset,
  RecordingAssetArchiveResponse,
  RecordingArchiveRepairResponse,
  RecordingAssetDetailResponse,
  RecordingAssetListResponse,
  RecordingStorageSettings,
  UpdateRecordingAssetRequest,
  UpdateRecordingStorageSettingsRequest,
} from '@shared/api.interface';
import {
  buildRecordingArchiveFileName,
  filterRecordingAssets,
  sortRecordingAssets,
} from '@shared/recording-assets.utils';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

interface StoredAsset extends RecordingAsset {
  ownerId: string;
  playablePath?: string;
}
interface AssetManifest {
  items: StoredAsset[];
}
interface StoredSettings extends RecordingStorageSettings {
  ownerId: string;
}

const DEFAULT_ARCHIVE_PATH = join(process.cwd(), 'data', 'recordings');

interface CommandResult {
  stderr: string;
  stdout: string;
}

interface PlayableFile {
  fileName: string;
  path: string;
}

interface AudioProbe {
  durationMs: number;
  formatNames: string[];
  isAac: boolean;
}

@Injectable()
export class RecordingAssetsService {
  private readonly logger = new Logger(RecordingAssetsService.name);
  private readonly manifestPath: string;
  private readonly settingsPath: string;
  private readonly uploadsPath: string;
  private readonly playablePath: string;
  private readonly backgroundEnabled: boolean;
  private readonly activePlayableTasks = new Set<string>();

  constructor(@Optional() baseDir?: string, backgroundEnabled = true) {
    const resolvedBaseDir = baseDir || process.cwd();
    this.backgroundEnabled = backgroundEnabled;
    this.manifestPath = join(resolvedBaseDir, '.recording-assets.json');
    this.settingsPath = join(
      resolvedBaseDir,
      '.recording-storage-settings.json',
    );
    this.uploadsPath = join(resolvedBaseDir, 'data', 'uploads');
    this.playablePath = join(resolvedBaseDir, 'data', 'recording-playable');
  }

  async list(
    ownerId: string,
    keyword?: string,
  ): Promise<RecordingAssetListResponse> {
    const items = sortRecordingAssets(
      filterRecordingAssets(
        (await this.loadAssets()).filter(
          (item) => item.ownerId === ownerId && !item.deletedAt,
        ),
        { keyword },
      ),
    );
    return {
      items: items.map((item) => this.toPublic(item)),
      totalItems: items.length,
    };
  }

  async get(
    ownerId: string,
    id: string,
  ): Promise<RecordingAssetDetailResponse> {
    return {
      item: this.toPublic(this.findOwned(await this.loadAssets(), ownerId, id)),
    };
  }

  async create(
    ownerId: string,
    input: CreateRecordingAssetRequest,
  ): Promise<RecordingAssetDetailResponse> {
    if (!input.media?.downloadUrl || !input.fileName || input.fileSize < 0) {
      throw new BadRequestException('录音文件信息不完整');
    }
    const now = new Date().toISOString();
    const item: StoredAsset = {
      id: randomUUID(),
      ownerId,
      title: input.title?.trim() || input.fileName.replace(/\.[^.]+$/u, ''),
      source: input.source,
      mimeType: input.mimeType,
      fileName: input.fileName,
      durationMs: input.durationMs ?? null,
      fileSize: input.fileSize,
      capturedAt: input.capturedAt || now,
      createdAt: now,
      updatedAt: now,
      storageStatus: 'app_only',
      processingStatus: 'unprocessed',
      playableStatus: 'pending',
      media: input.media,
      linkedJobIds: [],
    };
    const settings = await this.getSettings(ownerId);
    if (settings.autoArchive) item.storageStatus = 'pending_archive';
    const assets = await this.loadAssets();
    assets.push(item);
    await this.saveAssets(assets);
    this.schedulePlayable(ownerId, item.id);
    return { item: this.toPublic(item) };
  }

  async update(
    ownerId: string,
    id: string,
    input: UpdateRecordingAssetRequest,
  ): Promise<RecordingAssetDetailResponse> {
    const assets = await this.loadAssets();
    const item = this.findOwned(assets, ownerId, id);
    if (input.title !== undefined)
      item.title = input.title.trim() || item.title;
    if (input.processingStatus) item.processingStatus = input.processingStatus;
    if (input.linkedJobIds)
      item.linkedJobIds = [...new Set(input.linkedJobIds.filter(Boolean))];
    item.updatedAt = new Date().toISOString();
    await this.saveAssets(assets);
    return { item: this.toPublic(item) };
  }

  async archive(
    ownerId: string,
    id: string,
  ): Promise<RecordingAssetArchiveResponse> {
    const assets = await this.loadAssets();
    const item = this.findOwned(assets, ownerId, id);
    if (item.playableStatus !== 'ready' || !item.playablePath) {
      item.storageStatus = 'pending_archive';
      item.archiveError = undefined;
      if (item.playableStatus !== 'converting') {
        item.playableStatus = 'pending';
        item.playableError = undefined;
      }
      item.updatedAt = new Date().toISOString();
      await this.saveAssets(assets);
      this.schedulePlayable(ownerId, id);
      return {
        item: this.toPublic(item),
        archived: false,
        message: '正在准备通用 M4A，完成后会自动归档',
      };
    }
    return this.archivePlayable(ownerId, id);
  }

  async requestPlayable(
    ownerId: string,
    id: string,
  ): Promise<RecordingAssetDetailResponse> {
    const assets = await this.loadAssets();
    const item = this.findOwned(assets, ownerId, id);
    if (item.playableStatus !== 'ready') {
      if (item.playableStatus !== 'converting') {
        item.playableStatus = 'pending';
        item.playableError = undefined;
        item.updatedAt = new Date().toISOString();
        await this.saveAssets(assets);
      }
      this.schedulePlayable(ownerId, id);
    }
    return { item: this.toPublic(item) };
  }

  async repairLegacyArchives(
    ownerId: string,
  ): Promise<RecordingArchiveRepairResponse> {
    const assets = await this.loadAssets();
    const legacy = assets.filter(
      (item) =>
        item.ownerId === ownerId &&
        !item.deletedAt &&
        Boolean(item.archivePath && /\.bin$/iu.test(item.archivePath)),
    );
    legacy.forEach((item) => {
      item.storageStatus = 'pending_archive';
      item.archiveError = undefined;
      item.playableStatus =
        item.playableStatus === 'ready' &&
        Boolean(item.playablePath && existsSync(item.playablePath))
          ? 'ready'
          : 'pending';
      item.updatedAt = new Date().toISOString();
    });
    if (legacy.length > 0) await this.saveAssets(assets);
    legacy.forEach((item) => this.schedulePlayable(ownerId, item.id));
    return { queued: legacy.length, total: legacy.length };
  }

  async getPlayableFile(ownerId: string, id: string): Promise<PlayableFile> {
    const item = this.findOwned(await this.loadAssets(), ownerId, id);
    if (
      item.playableStatus !== 'ready' ||
      !item.playablePath ||
      !item.playableFileName ||
      !existsSync(item.playablePath)
    ) {
      throw new NotFoundException('通用 M4A 尚未准备完成');
    }
    return { fileName: item.playableFileName, path: item.playablePath };
  }

  async remove(
    ownerId: string,
    id: string,
  ): Promise<RecordingAssetDetailResponse> {
    const assets = await this.loadAssets();
    const item = this.findOwned(assets, ownerId, id);
    item.deletedAt = new Date().toISOString();
    item.updatedAt = item.deletedAt;
    await this.saveAssets(assets);
    return { item: this.toPublic(item) };
  }

  async getSettings(ownerId: string): Promise<RecordingStorageSettings> {
    const settings = await this.loadSettings();
    const effective =
      settings.ownerId && settings.ownerId !== ownerId
        ? this.defaultSettings()
        : settings;
    return this.toPublicSettings(effective);
  }

  async updateSettings(
    ownerId: string,
    input: UpdateRecordingStorageSettingsRequest,
  ): Promise<RecordingStorageSettings> {
    if (!input.archivePath?.trim())
      throw new BadRequestException('请填写录音归档目录');
    if (!isAbsolute(input.archivePath))
      throw new BadRequestException('归档目录必须是绝对路径');
    const next: StoredSettings = {
      ...input,
      archivePath: resolve(input.archivePath),
      ownerId,
      updatedAt: new Date().toISOString(),
    };
    await this.saveSettings(next);
    return this.toPublicSettings(next);
  }

  private findOwned(
    items: StoredAsset[],
    ownerId: string,
    id: string,
  ): StoredAsset {
    const item = items.find(
      (candidate) =>
        candidate.id === id &&
        candidate.ownerId === ownerId &&
        !candidate.deletedAt,
    );
    if (!item) throw new NotFoundException('录音记录不存在');
    return item;
  }

  private extractUploadId(url: string): string | null {
    const match = /\/api\/local-uploads\/([^/?#]+)/u.exec(url);
    return match?.[1] || null;
  }

  private toPublic(item: StoredAsset): RecordingAsset {
    const { ownerId: _ownerId, playablePath: _playablePath, ...publicItem } = item;
    if (item.playableStatus !== 'ready') return publicItem;
    return {
      ...publicItem,
      playableUrl: `/api/recording-assets/${item.id}/playable`,
    };
  }

  private schedulePlayable(ownerId: string, id: string): void {
    if (!this.backgroundEnabled) return;
    const taskKey = `${ownerId}:${id}`;
    if (this.activePlayableTasks.has(taskKey)) return;
    this.activePlayableTasks.add(taskKey);
    setImmediate(() => {
      void this.generatePlayable(ownerId, id)
        .catch((error: unknown) => {
          this.logger.error(`生成通用 M4A 任务异常: ${id} ${String(error)}`);
        })
        .finally(() => this.activePlayableTasks.delete(taskKey));
    });
  }

  private async generatePlayable(ownerId: string, id: string): Promise<void> {
    const assets = await this.loadAssets();
    const item = this.findOwned(assets, ownerId, id);
    if (
      item.playableStatus === 'ready' &&
      item.playablePath &&
      existsSync(item.playablePath)
    ) {
      if (item.storageStatus === 'pending_archive') await this.archivePlayable(ownerId, id);
      return;
    }
    if (item.playableStatus === 'converting') return;

    const sourcePath = this.resolveSourcePath(item);
    if (!sourcePath || !existsSync(sourcePath)) {
      await this.markPlayableFailure(
        ownerId,
        id,
        '找不到应用内原始录音，无法生成通用 M4A',
      );
      return;
    }

    item.playableStatus = 'converting';
    item.playableError = undefined;
    item.updatedAt = new Date().toISOString();
    await this.saveAssets(assets);

    const finalPath = join(this.playablePath, `${item.id}.m4a`);
    const temporaryPath = `${finalPath}.${process.pid}.${Date.now()}.tmp.m4a`;
    try {
      await mkdir(this.playablePath, { recursive: true });
      const sourceProbe = await this.inspectAudio(sourcePath);
      if (this.isPlayableM4a(sourceProbe)) {
        await copyFile(sourcePath, temporaryPath);
      } else {
        await this.runCommand('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          sourcePath,
          '-map',
          '0:a:0',
          '-vn',
          '-c:a',
          'aac',
          '-b:a',
          item.source === 'microphone' ? '96k' : '128k',
          '-movflags',
          '+faststart',
          '-y',
          temporaryPath,
        ]);
      }
      const result = await this.inspectAudio(temporaryPath);
      if (!this.isPlayableM4a(result) || result.durationMs <= 0) {
        throw new Error('M4A 容器或音频编码校验失败');
      }
      if (item.durationMs && Math.abs(result.durationMs - item.durationMs) > 1_500) {
        throw new Error('M4A 时长与原始录音不一致');
      }
      await unlink(finalPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
      await rename(temporaryPath, finalPath);
      const latest = await this.loadAssets();
      const latestItem = this.findOwned(latest, ownerId, id);
      latestItem.playableStatus = 'ready';
      latestItem.playablePath = finalPath;
      latestItem.playableFileName = buildRecordingArchiveFileName(
        latestItem.title,
        latestItem.capturedAt,
        'audio/mp4',
        latestItem.id,
      );
      latestItem.playableMimeType = 'audio/mp4';
      latestItem.playableFileSize = (await stat(finalPath)).size;
      latestItem.playableDurationMs = result.durationMs;
      latestItem.playableError = undefined;
      latestItem.updatedAt = new Date().toISOString();
      await this.saveAssets(latest);
      this.logger.log(`通用 M4A 已生成: ${latestItem.id}`);
      if (latestItem.storageStatus === 'pending_archive') {
        await this.archivePlayable(ownerId, id);
      }
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      await this.markPlayableFailure(
        ownerId,
        id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async archivePlayable(
    ownerId: string,
    id: string,
  ): Promise<RecordingAssetArchiveResponse> {
    const assets = await this.loadAssets();
    const item = this.findOwned(assets, ownerId, id);
    try {
      if (!item.playablePath || !existsSync(item.playablePath)) {
        throw new Error('通用 M4A 尚未准备完成');
      }
      const settings = await this.getSettings(ownerId);
      const archiveDir = resolve(settings.archivePath);
      await mkdir(archiveDir, { recursive: true });
      const fileName = buildRecordingArchiveFileName(
        item.title,
        item.capturedAt,
        'audio/mp4',
        item.id,
      );
      const archivePath = join(archiveDir, fileName);
      await copyFile(item.playablePath, archivePath);
      item.storageStatus = 'archived';
      item.archivePath = archivePath;
      item.archiveError = undefined;
      item.updatedAt = new Date().toISOString();
      await this.saveAssets(assets);
      return {
        item: this.toPublic(item),
        archived: true,
        message: '通用 M4A 已归档到本地目录',
      };
    } catch (error) {
      item.storageStatus = 'archive_failed';
      item.archiveError = error instanceof Error ? error.message : String(error);
      item.updatedAt = new Date().toISOString();
      await this.saveAssets(assets);
      this.logger.warn(`录音归档失败: ${item.id} ${item.archiveError}`);
      return {
        item: this.toPublic(item),
        archived: false,
        message: '归档失败，应用内原始录音仍然保留',
      };
    }
  }

  private resolveSourcePath(item: StoredAsset): string | null {
    const sourceId =
      item.media.storage?.id || this.extractUploadId(item.media.downloadUrl);
    const uploadPath = sourceId
      ? resolve(this.uploadsPath, basename(sourceId))
      : null;
    if (uploadPath && existsSync(uploadPath)) return uploadPath;
    if (
      item.archivePath &&
      /\.bin$/iu.test(item.archivePath) &&
      isAbsolute(item.archivePath) &&
      existsSync(item.archivePath)
    ) {
      return resolve(item.archivePath);
    }
    return uploadPath;
  }

  private async markPlayableFailure(
    ownerId: string,
    id: string,
    message: string,
  ): Promise<void> {
    try {
      const assets = await this.loadAssets();
      const item = this.findOwned(assets, ownerId, id);
      item.playableStatus = 'failed';
      item.playableError = message;
      if (item.storageStatus === 'pending_archive') {
        item.storageStatus = 'archive_failed';
        item.archiveError = message;
      }
      item.updatedAt = new Date().toISOString();
      await this.saveAssets(assets);
      this.logger.warn(`通用 M4A 生成失败: ${id} ${message}`);
    } catch (error) {
      this.logger.error(`记录 M4A 失败状态时出错: ${id} ${String(error)}`);
    }
  }

  private async inspectAudio(filePath: string): Promise<AudioProbe> {
    const result = await this.runCommand('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name:stream=codec_type,codec_name',
      '-of',
      'json',
      filePath,
    ]);
    const parsed: unknown = JSON.parse(result.stdout);
    const probe = parsed as {
      format?: { duration?: string; format_name?: string };
      streams?: Array<{ codec_name?: string; codec_type?: string }>;
    };
    const isAac = Boolean(probe.streams?.some(
      (stream) => stream.codec_type === 'audio' && stream.codec_name === 'aac',
    ));
    const durationMs = Math.round(Number(probe.format?.duration || 0) * 1_000);
    const formatNames = (probe.format?.format_name || '').split(',').filter(Boolean);
    return { durationMs, formatNames, isAac };
  }

  private isPlayableM4a(probe: AudioProbe): boolean {
    return (
      probe.isAac &&
      probe.formatNames.some((name) =>
        ['ipod', 'm4a', 'mov', 'mp4'].includes(name),
      )
    );
  }

  private async runCommand(
    command: string,
    args: string[],
  ): Promise<CommandResult> {
    return new Promise((resolveCommand, rejectCommand) => {
      const childProcess = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: process.platform === 'win32',
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      childProcess.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      childProcess.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      childProcess.on('error', rejectCommand);
      childProcess.on('close', (code) => {
        const result = {
          stderr: Buffer.concat(stderr).toString('utf8'),
          stdout: Buffer.concat(stdout).toString('utf8'),
        };
        if (code === 0) resolveCommand(result);
        else rejectCommand(new Error(result.stderr || `${command} 退出码 ${code}`));
      });
    });
  }
  private defaultSettings(): StoredSettings {
    return {
      autoArchive: false,
      archivePath: DEFAULT_ARCHIVE_PATH,
      checkDiskSpace: true,
      ownerId: '',
      updatedAt: new Date(0).toISOString(),
    };
  }
  private toPublicSettings(settings: StoredSettings): RecordingStorageSettings {
    const { ownerId: _ownerId, ...publicSettings } = settings;
    return publicSettings;
  }

  private async loadAssets(): Promise<StoredAsset[]> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.manifestPath, 'utf8'),
      );
      return this.isManifest(parsed) ? parsed.items : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.logger.warn('录音清单不可读，将使用空清单');
      return [];
    }
  }
  private async saveAssets(items: StoredAsset[]): Promise<void> {
    const tempPath = `${this.manifestPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(
      tempPath,
      `${JSON.stringify({ items }, null, 2)}\n`,
      'utf8',
    );
    await rename(tempPath, this.manifestPath);
  }
  private async loadSettings(): Promise<StoredSettings> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.settingsPath, 'utf8'),
      );
      return this.isSettings(parsed) ? parsed : this.defaultSettings();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.logger.warn('录音存储配置不可读，将使用默认配置');
      return this.defaultSettings();
    }
  }
  private async saveSettings(settings: StoredSettings): Promise<void> {
    const tempPath = `${this.settingsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.settingsPath);
  }
  private isManifest(value: unknown): value is AssetManifest {
    return Boolean(
      value &&
      typeof value === 'object' &&
      Array.isArray((value as AssetManifest).items),
    );
  }
  private isSettings(value: unknown): value is StoredSettings {
    const item = value as Partial<StoredSettings>;
    return Boolean(
      value &&
      typeof value === 'object' &&
      typeof item.archivePath === 'string' &&
      typeof item.ownerId === 'string',
    );
  }
}
