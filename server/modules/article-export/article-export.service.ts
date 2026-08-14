import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolveCliInvocation } from '../../common/utils/cli-command';
import type {
  ArticleArtifact,
  ArticleExportJob,
  ArticleExportReadiness,
  ArticleExportStage,
  ArticlePlatform,
  ArticleExportStyle,
  CreateArticleExportJobRequest,
} from '@shared/api.interface';
import {
  buildDouyinCopy,
  buildUnsupportedSummary,
  dropLeadingTitleBlock,
  extractDocumentTitle,
  parseMarkdownDocument,
  renderArticlePreviewHtml,
  renderBlocksToHtml,
  renderBlocksToMarkdown,
} from './article-export.utils';
import { TaskNotificationService } from '../task-notifications/task-notification.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { LocalDocumentService } from '../connectors/local-document.service';
import { DingTalkDocumentService } from '../connectors/dingtalk-document.service';

type CommandResult = {
  stdout: string;
  stderr: string;
};

interface FetchDocumentResult {
  data?: {
    document?: {
      content?: string;
      title?: string;
      document_title?: string;
      name?: string;
    };
  };
}

interface ParsedAuthStatus {
  identities?: {
    user?: {
      verified?: boolean;
    };
  };
}

@Injectable()
export class ArticleExportService {
  private readonly logger = new Logger(ArticleExportService.name);
  private readonly jobs = new Map<string, ArticleExportJob>();

  constructor(
    private readonly taskNotificationService: TaskNotificationService,
    private readonly connectorRegistryService: ConnectorRegistryService,
    private readonly localDocumentService: LocalDocumentService,
    private readonly dingTalkDocumentService: DingTalkDocumentService,
  ) {}

  async getReadiness(): Promise<ArticleExportReadiness> {
    const connectorType = await this.connectorRegistryService.getActiveConnector();
    const larkCli = await this.commandExists('lark-cli');
    const larkAuth = larkCli ? await this.checkLarkAuth() : false;
    const connectorReady = await this.connectorRegistryService.isActiveConnectorReady();
    return {
      larkCli,
      larkAuth,
      ready: connectorType === 'local' || connectorType === 'dingtalk' ? connectorReady : connectorType === 'feishu' && connectorReady && larkCli && larkAuth,
      connectorType,
      connectorReady,
    };
  }

  create(input: CreateArticleExportJobRequest): ArticleExportJob {
    const sourceDocUrl = this.validateSourceDocUrl(input.sourceDocUrl);
    const targetPlatforms = this.validateTargetPlatforms(input.targetPlatforms);
    const includeImages = input.includeImages !== false;
    const preferredStyle = this.resolvePreferredStyle(input.preferredStyle);

    const now = new Date().toISOString();
    const job: ArticleExportJob = {
      id: randomUUID(),
      stage: 'queued',
      progress: 2,
      message: '任务已创建，正在准备导出…',
      sourceDocUrl,
      targetPlatforms,
      artifacts: [],
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(job.id, job);
    void this.run(job.id, sourceDocUrl, targetPlatforms, includeImages, preferredStyle);
    return job;
  }

  get(id: string): ArticleExportJob {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('任务不存在或服务已重启');
    return job;
  }

  getArtifact(id: string, platform: ArticlePlatform): ArticleArtifact {
    const job = this.get(id);
    const artifact = job.artifacts.find((item) => item.platform === platform);
    if (!artifact) {
      throw new NotFoundException('指定平台的稿件不存在');
    }
    return artifact;
  }

  private async run(
    id: string,
    sourceDocUrl: string,
    targetPlatforms: Exclude<ArticlePlatform, 'source'>[],
    includeImages: boolean,
    preferredStyle: ArticleExportStyle,
  ): Promise<void> {
    const workDir = await mkdtemp(join(tmpdir(), 'article-export-'));

    try {
      this.update(id, 'checking', 8, '正在检查飞书 CLI 与登录态…');
      const readiness = await this.getReadiness();
      if (readiness.connectorType === 'feishu' && !readiness.larkCli) {
        throw new Error('未找到 lark-cli，请先安装飞书 CLI');
      }
      if (readiness.connectorType === 'feishu' && !readiness.larkAuth) {
        throw new Error('lark-cli 未登录或授权无效，请先完成飞书登录');
      }

      this.update(id, 'fetching', 20, '正在抓取飞书文档…');
      const sourceDocument = await this.fetchSourceDocument(sourceDocUrl);

      this.update(id, 'normalizing', 48, '正在归一化文档结构…');
      const parsedDocument = parseMarkdownDocument(sourceDocument.markdown);
      const title =
        sourceDocument.title || parsedDocument.title || extractDocumentTitle(parsedDocument.blocks) || '飞书文章导出';
      const normalizedBlocks = dropLeadingTitleBlock(parsedDocument.blocks, title);

      this.update(id, 'rendering', 64, '正在生成各平台稿件…');
      const artifacts: ArticleArtifact[] = [
        this.buildSourceArtifact(
          title,
          sourceDocUrl,
          sourceDocument.markdown,
          parsedDocument.blocks,
          preferredStyle,
          parsedDocument.unsupportedBlocks,
        ),
        ...targetPlatforms.map((platform) =>
          this.buildPlatformArtifact(
            platform,
            title,
            sourceDocUrl,
            normalizedBlocks,
            includeImages,
            preferredStyle,
            parsedDocument.unsupportedBlocks,
          ),
        ),
      ];

      this.patch(id, {
        stage: 'completed',
        progress: 100,
        message: '完成！多平台稿件已经生成。',
        sourceTitle: title,
        sourceDocUrl,
        artifacts,
      });
      this.notifyResult({
        event: 'completed',
        id,
        message: '完成！多平台稿件已经生成。',
        sourceType: targetPlatforms.join('、'),
        title,
        type: 'article-export',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      this.logger.error(`文章导出任务 ${id} 失败: ${message}`);
      this.patch(id, {
        stage: 'failed',
        message: '处理失败',
        error: message,
      });
      this.notifyResult({
        error: message,
        event: 'failed',
        id,
        message: '文章导出处理失败',
        type: 'article-export',
      });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private buildSourceArtifact(
    title: string,
    sourceDocUrl: string,
    sourceMarkdown: string,
    blocks: ReturnType<typeof parseMarkdownDocument>['blocks'],
    preferredStyle: ArticleExportStyle,
    unsupportedBlocks: string[],
  ): ArticleArtifact {
    return {
      platform: 'source',
      format: 'markdown',
      copyContent: sourceMarkdown,
      downloadFileName: this.buildDownloadFileName(title, 'source', 'md'),
      previewHtml: renderArticlePreviewHtml(blocks, {
        title,
        sourceUrl: sourceDocUrl,
        includeImages: true,
        style: preferredStyle,
      }),
      unsupportedBlocks,
    };
  }

  private buildPlatformArtifact(
    platform: Exclude<ArticlePlatform, 'source'>,
    title: string,
    sourceDocUrl: string,
    blocks: ReturnType<typeof parseMarkdownDocument>['blocks'],
    includeImages: boolean,
    preferredStyle: ArticleExportStyle,
    unsupportedBlocks: string[],
  ): ArticleArtifact {
    if (platform === 'wechat') {
      const copyContent = renderBlocksToHtml(blocks, {
        title,
        sourceUrl: sourceDocUrl,
        includeImages,
        style: preferredStyle,
      });
      return {
        platform,
        format: 'html',
        copyContent,
        downloadFileName: this.buildDownloadFileName(title, platform, 'html'),
        previewHtml: copyContent,
        unsupportedBlocks: this.buildUnsupportedList(
          unsupportedBlocks,
          blocks,
          includeImages,
        ),
      };
    }

    if (platform === 'zhihu') {
      const copyContent = renderBlocksToMarkdown(blocks, {
        title,
        sourceUrl: sourceDocUrl,
        includeImages,
        style: preferredStyle,
      });
      return {
        platform,
        format: 'markdown',
        copyContent,
        downloadFileName: this.buildDownloadFileName(title, platform, 'md'),
        previewHtml: renderArticlePreviewHtml(blocks, {
          title,
          sourceUrl: sourceDocUrl,
          includeImages,
          style: preferredStyle,
        }),
        unsupportedBlocks: this.buildUnsupportedList(
          unsupportedBlocks,
          blocks,
          includeImages,
        ),
      };
    }

    const copyContent = buildDouyinCopy(blocks, {
      title,
      sourceUrl: sourceDocUrl,
      includeImages,
      style: preferredStyle,
    });
    return {
      platform,
      format: 'txt',
      copyContent,
      downloadFileName: this.buildDownloadFileName(title, platform, 'txt'),
      previewHtml: renderArticlePreviewHtml(blocks, {
        title,
        sourceUrl: sourceDocUrl,
        includeImages,
        style: preferredStyle,
      }),
      unsupportedBlocks: this.buildUnsupportedList(
        unsupportedBlocks,
        blocks,
        includeImages,
      ),
    };
  }

  private buildUnsupportedList(
    unsupportedBlocks: string[],
    blocks: ReturnType<typeof parseMarkdownDocument>['blocks'],
    includeImages: boolean,
  ): string[] {
    const summary = new Set<string>(unsupportedBlocks);
    buildUnsupportedSummary(blocks, includeImages).forEach((entry) => {
      if (entry) summary.add(entry);
    });
    return Array.from(summary);
  }

  private buildDownloadFileName(
    title: string,
    platform: ArticlePlatform,
    extension: 'html' | 'md' | 'txt',
  ): string {
    const safeTitle = this.sanitizeFileName(title).slice(0, 48) || 'article';
    const date = new Date().toISOString().slice(0, 10);
    return `${date}-${platform}-${safeTitle}.${extension}`;
  }

  private sanitizeFileName(value: string): string {
    return value
      .replace(/[\\/:*?"<>|]/gu, '-')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  private async fetchSourceDocument(sourceDocUrl: string): Promise<{
    markdown: string;
    title?: string;
  }> {
    const connectorType = await this.connectorRegistryService.getActiveConnector();
    if (connectorType === 'local') {
      const match = sourceDocUrl.match(/\/api\/connectors\/local\/documents\/([0-9a-f-]{36})$/iu);
      if (!match?.[1]) throw new BadRequestException('本地文档地址无效。');
      return { markdown: await this.localDocumentService.read(match[1]) };
    }
    if (connectorType === 'dingtalk') {
      return await this.dingTalkDocumentService.read(sourceDocUrl);
    }
    const result = await this.runCommand('lark-cli', [
      'docs',
      '+fetch',
      '--as',
      'user',
      '--doc',
      sourceDocUrl,
      '--doc-format',
      'markdown',
      '--json',
    ]);

    const parsed = this.parseLooseJson<FetchDocumentResult>(result.stdout);
    const document = parsed.data?.document;
    const markdown = document?.content?.trim();
    if (!markdown) {
      throw new Error('飞书文档没有返回可导出的内容');
    }
    const title = document?.title || document?.document_title || document?.name;
    return {
      markdown,
      title,
    };
  }

  private async checkLarkAuth(): Promise<boolean> {
    try {
      const result = await this.runCommand('lark-cli', [
        'auth',
        'status',
        '--json',
        '--verify',
      ]);
      const parsed = this.parseLooseJson<ParsedAuthStatus>(result.stdout);
      return parsed.identities?.user?.verified === true;
    } catch {
      return false;
    }
  }

  private validateSourceDocUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('请先填写飞书文档地址');
    }
    return trimmed;
  }

  private validateTargetPlatforms(
    value: CreateArticleExportJobRequest['targetPlatforms'],
  ): Exclude<ArticlePlatform, 'source'>[] {
    const uniquePlatforms = Array.from(new Set(value || []));
    const allowed: Exclude<ArticlePlatform, 'source'>[] = [
      'wechat',
      'zhihu',
      'douyin',
    ];
    if (!uniquePlatforms.length) {
      throw new BadRequestException('请至少选择一个目标平台');
    }
    for (const platform of uniquePlatforms) {
      if (!allowed.includes(platform)) {
        throw new BadRequestException('存在不支持的目标平台');
      }
    }
    return uniquePlatforms;
  }

  private resolvePreferredStyle(
    value?: ArticleExportStyle,
  ): ArticleExportStyle {
    if (!value) return 'editorial';
    if (value === 'editorial' || value === 'concise') return value;
    throw new BadRequestException('不支持的稿件风格');
  }

  private update(
    id: string,
    stage: ArticleExportStage,
    progress: number,
    message: string,
  ): void {
    this.patch(id, { stage, progress, message });
  }

  private patch(id: string, update: Partial<ArticleExportJob>): void {
    const current = this.jobs.get(id);
    if (!current) return;
    this.jobs.set(id, {
      ...current,
      ...update,
      updatedAt: new Date().toISOString(),
    });
  }

  private notifyResult(input: Parameters<TaskNotificationService['notifyTaskResult']>[0]): void {
    void this.taskNotificationService.notifyTaskResult(input).catch(
      (error: unknown): void => {
        const message: string = error instanceof Error ? error.message : '未知错误';
        this.logger.warn(`文章导出任务 ${input.id} 的通知处理失败：${message}`);
      },
    );
  }

  private commandExists(command: string): Promise<boolean> {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    return this.runCommand(locator, [command])
      .then(() => true)
      .catch(() => false);
  }

  private runCommand(
    command: string,
    args: string[],
    stdin?: string,
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const invocation = resolveCliInvocation(command, args);
      const child = spawn(invocation.command, invocation.args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: process.platform === 'win32',
        ...(invocation.shell ? { shell: true } : {}),
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(this.commandError(command, stderr, stdout, code)));
      });

      if (stdin) {
        child.stdin.end(stdin);
      } else {
        child.stdin.end();
      }
    });
  }

  private commandError(
    command: string,
    stderr: string,
    stdout: string,
    code: number | null,
  ): string {
    const raw = (stderr || stdout).trim();
    if (!raw) return `${command} 执行失败（${code ?? 'unknown'}）`;

    try {
      const parsed = this.parseLooseJson<{
        error?: { hint?: string; message?: string };
      }>(raw);
      return parsed.error?.hint || parsed.error?.message || `${command} 执行失败`;
    } catch {
      return raw.split('\n').slice(-5).join('\n');
    }
  }

  private parseLooseJson<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      }
      throw new Error('无法解析 CLI 输出');
    }
  }
}
