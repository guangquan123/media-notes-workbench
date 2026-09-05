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
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

interface StoredAsset extends RecordingAsset {
  ownerId: string;
}
interface AssetManifest {
  items: StoredAsset[];
}
interface StoredSettings extends RecordingStorageSettings {
  ownerId: string;
}

const DEFAULT_ARCHIVE_PATH = join(process.cwd(), 'data', 'recordings');

@Injectable()
export class RecordingAssetsService {
  private readonly logger = new Logger(RecordingAssetsService.name);
  private readonly manifestPath: string;
  private readonly settingsPath: string;
  private readonly uploadsPath: string;

  constructor(@Optional() baseDir?: string) {
    const resolvedBaseDir = baseDir || process.cwd();
    this.manifestPath = join(resolvedBaseDir, '.recording-assets.json');
    this.settingsPath = join(
      resolvedBaseDir,
      '.recording-storage-settings.json',
    );
    this.uploadsPath = join(resolvedBaseDir, 'data', 'uploads');
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
      media: input.media,
      linkedJobIds: [],
    };
    const settings = await this.getSettings(ownerId);
    if (settings.autoArchive) item.storageStatus = 'pending_archive';
    const assets = await this.loadAssets();
    assets.push(item);
    await this.saveAssets(assets);
    if (settings.autoArchive) {
      const archived = await this.archive(ownerId, item.id);
      return { item: archived.item };
    }
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
    const settings = await this.getSettings(ownerId);
    try {
      const sourceId =
        item.media.storage?.id || this.extractUploadId(item.media.downloadUrl);
      if (!sourceId) throw new Error('找不到应用内录音文件');
      const sourcePath = resolve(this.uploadsPath, basename(sourceId));
      const archiveDir = resolve(settings.archivePath);
      await mkdir(archiveDir, { recursive: true });
      const fileName = buildRecordingArchiveFileName(
        item.title,
        item.capturedAt,
        item.mimeType,
        item.id,
      );
      const archivePath = join(archiveDir, fileName);
      await copyFile(sourcePath, archivePath);
      item.storageStatus = 'archived';
      item.archivePath = archivePath;
      item.archiveError = undefined;
      item.updatedAt = new Date().toISOString();
      await this.saveAssets(assets);
      return {
        item: this.toPublic(item),
        archived: true,
        message: '录音已归档到本地目录',
      };
    } catch (error) {
      item.storageStatus = 'archive_failed';
      item.archiveError =
        error instanceof Error ? error.message : String(error);
      item.updatedAt = new Date().toISOString();
      await this.saveAssets(assets);
      this.logger.warn(`录音归档失败: ${item.id} ${item.archiveError}`);
      return {
        item: this.toPublic(item),
        archived: false,
        message: '归档失败，应用内副本仍然保留',
      };
    }
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
    const { ownerId: _ownerId, ...publicItem } = item;
    return publicItem;
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
