import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { AuthNPaasService } from '@lark-apaas/nestjs-authnpaas';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { availableParallelism, homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  CreateNoteJobRequest,
  JobStage,
  NoteJob,
  NoteStyle,
  NoteSourceType,
  PairedMediaAlignmentResult,
  PairedMediaInput,
  SourcePlatform,
  SystemReadiness,
  UploadedMediaPart,
  UploadedMediaInput,
} from '@shared/api.interface';
import {
  getDouyinAudioFallbackArgs,
  isAudioRematrixError,
  isDouyinTransientMediaError,
  MAX_MEDIA_SIZE_BYTES,
  normalizePlatformSourceUrl,
  validateMediaDownloadUrl,
  validateNoteJobRequest,
} from './note-jobs.utils';
import { mapWithConcurrency } from '@shared/async.utils';
import {
  buildRawDocumentTitle,
  buildRawTranscriptMarkdown,
} from './note-document.utils';
import { NoteHistoryService } from './note-history.service';
import { getParseQuality } from './pdf-note.utils';
import { buildDocumentRawMarkdown } from './document-note.utils';
import { NoteTemplateService } from './note-template.service';
import { NoteReviewTaskService } from './note-review-task.service';
import { FrameExtractionService, KeyFrame } from './frame-extraction.service';
import { FrameUploadService } from './frame-upload.service';
import { FrameAiEnhanceService } from './frame-ai-enhance.service';
import { FrameInsertionService } from './frame-insertion.service';
import {
  buildEnergyEnvelope,
  estimateAudioAlignment,
  fuseTranscriptSegments,
  parseWhisperJson,
  type FusedTranscriptResult,
  type TranscriptSegment,
} from './paired-media.utils';

type CommandResult = { stdout: string; stderr: string };

interface CapabilityTextRetryInput {
  readonly pluginInstanceId: string;
  readonly actionKey: string;
  readonly outputMode: 'stream';
  readonly pluginInput: Record<string, unknown>;
  readonly textFields: readonly string[];
  readonly emptyResultMessage: string;
}

interface VideoMetadata {
  title?: string;
  uploader?: string;
  webpage_url?: string;
  duration_string?: string;
  mediaUrl?: string;
}

interface PreparedPairedMedia {
  auxiliaryAudioPath: string;
  metadata: VideoMetadata;
  sourceLabel: string;
  sourceUrl: string;
  videoAudioPath: string;
  videoPath: string;
}

interface SourceProfile {
  readonly label: string;
  readonly urlHosts: readonly string[];
  readonly referer: string;
  readonly origin: string;
  readonly urlErrorMessage: string;
}

interface StoredNoteJob {
  job: NoteJob;
  larkUserId: string | null;
  ownerId: string;
}

const MEDIA_DOWNLOAD_CONCURRENCY = 2;
const WHISPER_THREAD_COUNT = Math.min(8, availableParallelism());
const CAPABILITY_RATE_LIMIT_RETRY_DELAYS_MS = [15_000, 45_000, 90_000];
const DOUYIN_MEDIA_RETRY_DELAYS_MS = [1_000, 3_000, 8_000];
const ALIGNMENT_SAMPLE_RATE = 4_000;
const ALIGNMENT_BUCKET_MS = 1_000;
const ALIGNMENT_MAX_OFFSET_MS = 30 * 60 * 1_000;
const TIMESTAMPED_AUDIO_CHUNK_MS = 20 * 60 * 1_000;

const SOURCE_PROFILES: Record<SourcePlatform, SourceProfile> = {
  bilibili: {
    label: 'B站',
    urlHosts: ['bilibili.com', 'b23.tv'],
    referer: 'https://www.bilibili.com/',
    origin: 'https://www.bilibili.com',
    urlErrorMessage: '请输入有效的 B站视频地址',
  },
  douyin: {
    label: '抖音',
    urlHosts: ['douyin.com', 'iesdouyin.com', 'v.douyin.com'],
    referer: 'https://www.douyin.com/',
    origin: 'https://www.douyin.com',
    urlErrorMessage: '请输入有效的抖音视频地址',
  },
};

@Injectable()
export class NoteJobsService {
  private readonly logger = new Logger(NoteJobsService.name);
  private readonly jobs = new Map<string, StoredNoteJob>();
  private readonly whisperModelPath = join(
    process.cwd(),
    'models',
    'ggml-base-q5_1.bin',
  );

  constructor(
    @Inject() private readonly capabilityService: CapabilityService,
    private readonly authNPaasService: AuthNPaasService,
    private readonly noteHistoryService: NoteHistoryService,
    private readonly noteReviewTaskService: NoteReviewTaskService,
    private readonly noteTemplateService: NoteTemplateService,
    private readonly frameExtractionService: FrameExtractionService,
    private readonly frameUploadService: FrameUploadService,
    private readonly frameAiEnhanceService: FrameAiEnhanceService,
    private readonly frameInsertionService: FrameInsertionService,
  ) {}

  async getReadiness(): Promise<SystemReadiness> {
    const [ytDlp, ffmpeg, whisperCli, whisperModel, larkCli] =
      await Promise.all([
        this.commandExists('yt-dlp'),
        this.commandExists('ffmpeg'),
        this.commandExists('whisper-cli'),
        this.fileExists(this.whisperModelPath),
        this.commandExists('lark-cli'),
      ]);
    return {
      ytDlp,
      ffmpeg,
      whisperCli,
      whisperModel,
      larkCli,
      ready: ffmpeg && whisperCli && whisperModel && larkCli,
      platformReady: ytDlp && ffmpeg && whisperCli && whisperModel && larkCli,
      mediaReady: ffmpeg && whisperCli && whisperModel && larkCli,
      documentReady: larkCli,
      pdfReady: larkCli,
    };
  }

  async create(input: CreateNoteJobRequest, ownerId: string): Promise<NoteJob> {
    let larkUserId: string | null = null;
    try {
      larkUserId = await this.authNPaasService.getCurrentUserLarkUserId();
    } catch (error) {
      const message: string =
        error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`无法获取当前用户飞书账号: ${message}`);
    }
    return this.createForOwner(input, ownerId, larkUserId);
  }

  async createFromInbox(
    input: CreateNoteJobRequest,
    ownerId: string,
    larkUserId: string,
  ): Promise<NoteJob> {
    return this.createForOwner(input, ownerId, larkUserId);
  }

  private async createForOwner(
    input: CreateNoteJobRequest,
    ownerId: string,
    larkUserId: string | null,
  ): Promise<NoteJob> {
    const validatedInput = validateNoteJobRequest(input);
    const sourceType: NoteSourceType = validatedInput.sourceType;
    const sourcePlatform =
      sourceType === 'platform'
        ? this.resolveSourcePlatform(input.sourcePlatform)
        : undefined;
    const sourceLabel =
      sourceType === 'platform' && sourcePlatform
        ? this.getSourceLabel(sourcePlatform)
        : sourceType === 'video'
          ? '本地视频'
          : sourceType === 'audio'
            ? '录音文件'
            : sourceType === 'paired'
              ? '双源会议/培训'
              : '文档资料';
    const cookieBrowser =
      sourceType === 'platform'
        ? this.validateCookieBrowser(input.cookieBrowser)
        : undefined;

    const now = new Date().toISOString();
    const job: NoteJob = {
      id: randomUUID(),
      stage: 'queued',
      progress: 2,
      message: '任务已创建，正在准备…',
      sourceType,
      sourcePlatform,
      sourceLabel,
      mediaFileName:
        validatedInput.sourceType === 'platform'
          ? undefined
          : validatedInput.sourceType === 'paired'
            ? [
                validatedInput.pairedMedia.video.fileName,
                validatedInput.pairedMedia.auxiliaryAudio.fileName,
              ].join('、')
            : validatedInput.mediaItems
                .map((media: UploadedMediaInput) => media.fileName)
                .join('、'),
      createdAt: now,
      updatedAt: now,
    };
    await this.noteHistoryService.create(job, ownerId);
    this.jobs.set(job.id, { job, larkUserId, ownerId });
    void this.run(
      job.id,
      validatedInput,
      ownerId,
      sourcePlatform,
      cookieBrowser,
      larkUserId,
    );
    return job;
  }

  get(id: string, ownerId: string): NoteJob {
    const stored: StoredNoteJob | undefined = this.jobs.get(id);
    if (!stored || stored.ownerId !== ownerId) {
      throw new NotFoundException('任务不存在或服务已重启');
    }
    return stored.job;
  }

  private async run(
    id: string,
    input: ReturnType<typeof validateNoteJobRequest>,
    ownerId: string,
    sourcePlatform?: SourcePlatform,
    cookieBrowser?: CreateNoteJobRequest['cookieBrowser'],
    larkUserId?: string | null,
  ) {
    const workDir = await mkdtemp(join(tmpdir(), 'video-note-'));
    try {
      this.update(id, 'checking', 6, '正在检查本机依赖…');
      const readiness = await this.getReadiness();
      if (!readiness.larkCli) {
        throw new Error('未找到 lark-cli，请先安装并登录飞书');
      }
      if (input.sourceType === 'pdf' || input.sourceType === 'document') {
        await this.runDocument(id, workDir, input, ownerId, larkUserId);
        return;
      }
      if (
        input.sourceType !== 'video' &&
        input.sourceType !== 'audio' &&
        input.sourceType !== 'paired' &&
        input.sourceType !== 'platform'
      ) {
        throw new Error('不支持的内容来源');
      }
      if (input.sourceType === 'platform' && !readiness.ytDlp) {
        throw new Error('未找到 yt-dlp，请先安装 yt-dlp');
      }
      if (!readiness.ffmpeg) throw new Error('未找到 ffmpeg，请先安装 ffmpeg');
      if (!readiness.whisperCli)
        throw new Error('未找到 whisper-cli，请先安装 whisper-cpp');
      if (!readiness.whisperModel) throw new Error('未找到本机 Whisper 模型');

      if (input.sourceType === 'platform' && !sourcePlatform) {
        throw new Error('视频平台信息不完整');
      }
      const preparedPairedMedia: PreparedPairedMedia | undefined =
        input.sourceType === 'paired'
          ? await this.preparePairedMedia(
              id,
              workDir,
              input.pairedMedia,
            )
          : undefined;
      const preparedMedia =
        input.sourceType === 'paired'
          ? undefined
          : input.sourceType === 'platform'
            ? await this.preparePlatformMedia(
                id,
                workDir,
                input.url,
                sourcePlatform,
                cookieBrowser,
              )
            : await this.prepareUploadedMedia(id, workDir, input);
      const metadata: VideoMetadata =
        preparedPairedMedia?.metadata || preparedMedia!.metadata;
      const sourceUrl: string =
        preparedPairedMedia?.sourceUrl || preparedMedia!.sourceUrl;
      const sourceLabel: string =
        preparedPairedMedia?.sourceLabel || preparedMedia!.sourceLabel;
      const videoTitle = metadata.title || `${sourceLabel}学习笔记`;
      this.patch(id, { videoTitle });
      await this.persistTitle(id, videoTitle);

      let keyFrames: KeyFrame[] = [];
      let transcript = '';
      let archiveTranscript = '';
      if (input.sourceType === 'paired' && preparedPairedMedia) {
        const alignment: PairedMediaAlignmentResult =
          await this.resolvePairedAlignment(
            id,
            workDir,
            preparedPairedMedia,
            input.pairedMedia,
          );
        this.patch(id, { pairedAlignment: alignment });
        if (alignment.status === 'needs_review') {
          throw new Error(
            '无法可靠确认视频与辅助录音的时间关系。请确认两份文件属于同一场内容，或改用手动时间偏移后重试。',
          );
        }
        const framePromise: Promise<KeyFrame[]> = this.extractAndUploadFrames(
          id,
          workDir,
          preparedPairedMedia.videoPath,
        );
        const transcriptionPromise: Promise<{
          auxiliarySegments: TranscriptSegment[];
          videoSegments: TranscriptSegment[];
        }> = (async () => {
          this.update(
            id,
            'transcribing',
            44,
            '正在分别转录视频音轨和辅助录音…',
          );
          const videoSegments: TranscriptSegment[] =
            await this.transcribeTimestamped(
              id,
              preparedPairedMedia.videoAudioPath,
              workDir,
              'video-track',
            );
          this.update(
            id,
            'transcribing',
            54,
            '视频音轨已完成，正在转录辅助录音…',
          );
          const auxiliarySegments: TranscriptSegment[] =
            await this.transcribeTimestamped(
              id,
              preparedPairedMedia.auxiliaryAudioPath,
              workDir,
              'auxiliary-track',
            );
          return { auxiliarySegments, videoSegments };
        })();
        const [extractedFrames, transcriptions] = await Promise.all([
          framePromise,
          transcriptionPromise,
        ]);
        const { auxiliarySegments, videoSegments } = transcriptions;
        const fused: FusedTranscriptResult = fuseTranscriptSegments({
          audioOffsetMs: alignment.audioOffsetMs,
          auxiliarySegments,
          videoSegments,
        });
        if (!fused.markdown.trim()) throw new Error('双源转录结果为空');
        transcript = this.buildPairedSummaryTranscript(fused, alignment);
        archiveTranscript = this.buildPairedArchiveTranscript({
          alignment,
          auxiliaryFileName: input.pairedMedia.auxiliaryAudio.fileName,
          auxiliarySegments,
          fused,
          videoFileName: input.pairedMedia.video.fileName,
          videoSegments,
        });
        keyFrames = extractedFrames;
      } else if (preparedMedia) {
        this.update(id, 'transcribing', 44, '音频已就绪，正在转成文字…');
        let audioParts: string[] = [];
        if (input.sourceType !== 'audio') {
          const videoPath = await this.findVideoPath(workDir);
          if (videoPath) {
            [audioParts, keyFrames] = await Promise.all([
              this.splitAudioIfNeeded(preparedMedia.audioPath, workDir),
              this.extractAndUploadFrames(id, workDir, videoPath),
            ]);
          } else {
            audioParts = await this.splitAudioIfNeeded(
              preparedMedia.audioPath,
              workDir,
            );
          }
        } else {
          audioParts = await this.splitAudioIfNeeded(
            preparedMedia.audioPath,
            workDir,
          );
        }
        const transcripts: string[] = [];
        for (let index = 0; index < audioParts.length; index += 1) {
          if (audioParts.length > 1) {
            this.update(
              id,
              'transcribing',
              44 + Math.round((index / audioParts.length) * 20),
              `正在转录第 ${index + 1}/${audioParts.length} 段音频…`,
            );
          }
          transcripts.push(await this.transcribe(id, audioParts[index]));
        }
        transcript = transcripts.join('\n\n');
        archiveTranscript = transcript;
      }
      if (!transcript.trim()) throw new Error('转录结果为空');
      await this.persistRawTranscript(id, archiveTranscript);

      this.update(id, 'publishing', 66, '转录完成，正在归档原文…');
      const rawDocumentUrl = await this.createRawTranscriptDocument({
        duration: metadata.duration_string || '未知',
        generatedDate: new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()),
        sourceLabel,
        sourceUrl,
        title: videoTitle,
        transcript: archiveTranscript,
        uploader: metadata.uploader || '未知',
      });
      if (rawDocumentUrl) {
        this.patch(id, { rawDocumentUrl });
        await this.persistRawDocument(id, rawDocumentUrl);
      }

      this.update(id, 'summarizing', 70, '原文已归档，正在检索补充依据…');
      const editorResearch = await this.researchEvidence(
        videoTitle,
        transcript,
      );
      const promptSnapshot = await this.noteTemplateService.getActivePrompt(
        ownerId,
        input.noteStyle,
      );
      await this.noteHistoryService.updatePromptSnapshot(
        id,
        input.noteStyle,
        promptSnapshot.content,
        promptSnapshot.versionId,
      );
      const styleRequirements: string = promptSnapshot.content;
      this.update(id, 'summarizing', 74, '依据已整理，正在撰写学习笔记…');
      const markdown = await this.summarize({
        transcript,
        editorResearch,
        noteStyle: input.noteStyle,
        styleRequirements,
        title: videoTitle,
        uploader: metadata.uploader || '未知',
        duration: metadata.duration_string || '未知',
        sourceUrl,
        sourceLabel,
        generatedDate: new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()),
      });
      this.update(id, 'summarizing', 80, '初稿已完成，正在校验完整性和真实性…');
      const reviewedMarkdown = await this.reviewNoteQuality({
        draftNote: markdown,
        noteStyle: input.noteStyle,
        styleRequirements,
        transcript,
      });
      this.update(id, 'summarizing', 86, '质量校验完成，正在生成知识框架图…');
      const markdownWithFrames = keyFrames.length > 0
        ? this.frameInsertionService.insertFramesIntoMarkdown(reviewedMarkdown, keyFrames)
        : reviewedMarkdown;
      const knowledgeMapUrl = await this.generateKnowledgeMap(markdownWithFrames);
      const summaryMarkdown = knowledgeMapUrl
        ? this.insertKnowledgeMap(markdownWithFrames, knowledgeMapUrl)
        : markdownWithFrames;
      const finalMarkdown = rawDocumentUrl
        ? this.appendRawDocumentReference(summaryMarkdown, rawDocumentUrl)
        : summaryMarkdown;
      const noteTitle =
        this.extractMarkdownTitle(reviewedMarkdown) || videoTitle;
      await this.persistTitle(id, noteTitle);

      this.update(id, 'publishing', 88, '笔记已生成，正在写入飞书文档…');
      const documentUrl = await this.createLarkDocument(
        noteTitle,
        finalMarkdown,
      );
      this.patch(id, {
        stage: 'completed',
        progress: 100,
        message: '完成！飞书学习笔记已创建。',
        rawDocumentUrl,
        documentUrl,
      });
      await this.persistFinish(id, {
        status: 'completed',
        rawDocumentUrl,
        documentUrl,
      });
      await this.createReviewTask(id, noteTitle, documentUrl, larkUserId);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '未知错误';
      const message = sourcePlatform
        ? this.friendlyDownloadError(rawMessage, sourcePlatform, cookieBrowser)
        : rawMessage;
      this.logger.error(`任务 ${id} 失败: ${message}`);
      this.patch(id, {
        stage: 'failed',
        message: '处理失败',
        error: message,
      });
      await this.persistFinish(id, {
        status: 'failed',
        rawDocumentUrl: this.jobs.get(id)?.job.rawDocumentUrl,
        error: message,
      });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private async runDocument(
    id: string,
    workDir: string,
    input: Extract<
      ReturnType<typeof validateNoteJobRequest>,
      { sourceType: 'pdf' | 'document' }
    >,
    ownerId: string,
    larkUserId?: string | null,
  ): Promise<void> {
    this.update(id, 'preparing', 14, '正在安全读取文档文件…');
    const parsedItems: Array<{
      content: string;
      fileHash: string;
      fileName: string;
      parseQuality: 'parsed' | 'needs_ocr' | 'needs_review';
      sourceUrl: string;
    }> = [];
    for (let index = 0; index < input.mediaItems.length; index += 1) {
      const media: UploadedMediaInput = input.mediaItems[index];
      const extension: string = media.fileName.split('.').pop() || 'document';
      const sourcePath: string = join(workDir, `source-${index}.${extension}`);
      this.update(
        id,
        'preparing',
        14 + Math.round((index / input.mediaItems.length) * 14),
        `正在读取第 ${index + 1}/${input.mediaItems.length} 个文档…`,
      );
      await this.downloadUploadedMedia(id, media, sourcePath);
      const fileHash: string = createHash('sha256')
        .update(await readFile(sourcePath))
        .digest('hex');
      this.update(
        id,
        'parsing',
        28 + Math.round((index / input.mediaItems.length) * 14),
        `正在解析第 ${index + 1}/${input.mediaItems.length} 个文档…`,
      );
      const content: string = await this.parseDocument(media.downloadUrl);
      parsedItems.push({
        content,
        fileHash,
        fileName: media.fileName,
        parseQuality: getParseQuality(content),
        sourceUrl: media.downloadUrl,
      });
    }
    const primaryItem = parsedItems[0];
    const title: string =
      input.mediaItems.length > 1
        ? `多文档融合：${input.mediaItems.length} 个文件`
        : primaryItem.fileName.replace(/[.][^.]+$/u, '') || '文档学习资料';
    const parsedContent: string = parsedItems
      .map(
        (item: (typeof parsedItems)[number], index: number) =>
          `[来源 ${index + 1}：${item.fileName}]\n${item.content}`,
      )
      .join('\n\n');
    await this.persistRawTranscript(id, parsedContent);
    const parseQuality = parsedItems.some(
      (item: (typeof parsedItems)[number]) => item.parseQuality === 'needs_ocr',
    )
      ? 'needs_ocr'
      : parsedItems.some(
            (item: (typeof parsedItems)[number]) =>
              item.parseQuality === 'needs_review',
          )
        ? 'needs_review'
        : 'parsed';
    this.patch(id, {
      fileHash: primaryItem.fileHash,
      videoTitle: title,
      parseQuality,
    });
    await this.persistTitle(id, title);
    this.update(
      id,
      'publishing',
      42,
      parseQuality === 'parsed'
        ? '文档解析完成，正在归档原文…'
        : '文档文本质量需人工核对，正在保留可追溯原文…',
    );
    const generatedDate: string = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const rawDocumentUrl = await this.createRawDocumentArchive({
      generatedDate,
      items: parsedItems,
    });
    if (rawDocumentUrl) {
      this.patch(id, { rawDocumentUrl });
      await this.persistRawDocument(id, rawDocumentUrl);
    }

    this.update(id, 'summarizing', 58, '正在提炼知识框架与核心观点…');
    const editorResearch: string = await this.researchEvidence(
      title,
      parsedContent,
    );
    const promptSnapshot = await this.noteTemplateService.getActivePrompt(
      ownerId,
      input.noteStyle,
    );
    await this.noteHistoryService.updatePromptSnapshot(
      id,
      input.noteStyle,
      promptSnapshot.content,
      promptSnapshot.versionId,
    );
    const styleRequirements: string = promptSnapshot.content;
    const markdown: string = await this.summarizeDocument({
      content: parsedContent,
      editorResearch,
      fileHash: primaryItem.fileHash,
      fileName: input.mediaItems
        .map((media: UploadedMediaInput) => media.fileName)
        .join('、'),
      generatedDate,
      noteStyle: input.noteStyle,
      styleRequirements,
      parseQuality,
      sourceUrl: input.mediaItems
        .map((media: UploadedMediaInput) => media.downloadUrl)
        .join('、'),
      title,
    });
    this.update(id, 'summarizing', 78, '正在核验笔记与文档原文的一致性…');
    const reviewedMarkdown: string = await this.reviewDocumentNote({
      draftNote: markdown,
      noteStyle: input.noteStyle,
      styleRequirements,
      sourceText: parsedContent,
    });
    this.update(id, 'summarizing', 86, '正在生成知识框架图…');
    const knowledgeMapUrl: string | undefined =
      await this.generateKnowledgeMap(reviewedMarkdown);
    const withKnowledgeMap: string = knowledgeMapUrl
      ? this.insertKnowledgeMap(reviewedMarkdown, knowledgeMapUrl)
      : reviewedMarkdown;
    const finalMarkdown: string = rawDocumentUrl
      ? this.appendRawDocumentReference(withKnowledgeMap, rawDocumentUrl)
      : withKnowledgeMap;
    const noteTitle: string =
      this.extractMarkdownTitle(reviewedMarkdown) || title;
    await this.persistTitle(id, noteTitle);

    this.update(id, 'publishing', 92, '学习笔记已完成，正在写入飞书文档…');
    const documentUrl: string = await this.createLarkDocument(
      noteTitle,
      finalMarkdown,
    );
    this.patch(id, {
      stage: 'completed',
      progress: 100,
      message: '完成！文档学习笔记已创建。',
      rawDocumentUrl,
      documentUrl,
    });
    await this.persistFinish(id, {
      status: 'completed',
      rawDocumentUrl,
      documentUrl,
    });
    await this.createReviewTask(id, noteTitle, documentUrl, larkUserId);
  }

  private async preparePlatformMedia(
    id: string,
    workDir: string,
    rawUrl: string,
    sourcePlatform: SourcePlatform,
    cookieBrowser?: CreateNoteJobRequest['cookieBrowser'],
  ): Promise<{
    audioPath: string;
    metadata: VideoMetadata;
    sourceUrl: string;
    sourceLabel: string;
  }> {
    this.update(id, 'downloading', 14, '正在解析视频并提取音频…');
    const url = normalizePlatformSourceUrl(rawUrl, sourcePlatform);
    const sourceArgs: string[] =
      sourcePlatform === 'bilibili'
        ? await this.buildSourceArgs(sourcePlatform, cookieBrowser)
        : [];
    const metadata: VideoMetadata =
      sourcePlatform === 'douyin'
        ? await this.getDouyinMetadata(url)
        : await this.getYtDlpMetadata(url, sourceArgs);
    const audioPath: string = join(workDir, 'audio.mp3');
    if (sourcePlatform === 'douyin' && metadata.mediaUrl) {
      await this.extractDouyinAudio(metadata.mediaUrl, audioPath);
    } else {
      await this.runCommand('yt-dlp', [
        ...sourceArgs,
        '--no-playlist',
        '--extract-audio',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '5',
        '--keep-video',
        '--output',
        join(workDir, 'source.%(ext)s'),
        url,
      ]);
      const { rename } = await import('node:fs/promises');
      await rename(join(workDir, 'source.mp3'), audioPath);
    }
    return {
      audioPath,
      metadata,
      sourceUrl: metadata.webpage_url || url,
      sourceLabel: this.getSourceLabel(sourcePlatform),
    };
  }

  private async prepareUploadedMedia(
    id: string,
    workDir: string,
    input: { sourceType: 'video' | 'audio'; mediaItems: UploadedMediaInput[] },
  ): Promise<{
    audioPath: string;
    metadata: VideoMetadata;
    sourceUrl: string;
    sourceLabel: string;
  }> {
    const sourceLabel: string =
      input.sourceType === 'video' ? '本地视频' : '录音文件';
    const audioPaths: string[] = [];
    for (let index = 0; index < input.mediaItems.length; index += 1) {
      const media: UploadedMediaInput = input.mediaItems[index];
      this.update(
        id,
        'preparing',
        14 + Math.round((index / input.mediaItems.length) * 16),
        `正在读取并提取第 ${index + 1}/${input.mediaItems.length} 个${sourceLabel}…`,
      );
      const extension: string =
        media.fileName
          .split('.')
          .pop()
          ?.replace(/[^a-z0-9]/giu, '') || 'media';
      const sourcePath: string = join(workDir, `source-${index}.${extension}`);
      const audioPath: string = join(workDir, `audio-${index}.mp3`);
      await this.downloadUploadedMedia(id, media, sourcePath);
      await this.measureStep(
        id,
        'extract_audio',
        { fileName: media.fileName },
        () =>
          this.runCommand('ffmpeg', [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            sourcePath,
            '-vn',
            '-codec:a',
            'libmp3lame',
            '-q:a',
            '5',
            '-y',
            audioPath,
          ]),
      );
      audioPaths.push(audioPath);
    }
    const audioPath: string = await this.mergeAudioFiles(audioPaths, workDir);
    const fileNames: string = input.mediaItems
      .map((media: UploadedMediaInput) => media.fileName)
      .join('、');
    return {
      audioPath,
      metadata: {
        title:
          input.mediaItems.length > 1
            ? `多视频合并：${input.mediaItems.length} 个视频`
            : input.mediaItems[0].fileName.replace(/[.][^.]+$/u, ''),
        uploader: '本地文件',
      },
      sourceUrl: `用户上传的本地文件：${fileNames}`,
      sourceLabel:
        input.mediaItems.length > 1
          ? `本地视频（${input.mediaItems.length} 个合并）`
          : sourceLabel,
    };
  }

  private async preparePairedMedia(
    id: string,
    workDir: string,
    input: PairedMediaInput,
  ): Promise<PreparedPairedMedia> {
    this.update(id, 'preparing', 12, '正在读取主视频和辅助录音…');
    const videoExtension: string =
      input.video.fileName
        .split('.')
        .pop()
        ?.replace(/[^a-z0-9]/giu, '') || 'mp4';
    const audioExtension: string =
      input.auxiliaryAudio.fileName
        .split('.')
        .pop()
        ?.replace(/[^a-z0-9]/giu, '') || 'm4a';
    const videoPath: string = join(
      workDir,
      `paired-video.${videoExtension}`,
    );
    const auxiliarySourcePath: string = join(
      workDir,
      `paired-audio.${audioExtension}`,
    );
    await Promise.all([
      this.downloadUploadedMedia(id, input.video, videoPath),
      this.downloadUploadedMedia(
        id,
        input.auxiliaryAudio,
        auxiliarySourcePath,
      ),
    ]);

    this.update(id, 'preparing', 24, '文件读取完成，正在提取两路音轨…');
    const videoAudioPath: string = join(workDir, 'paired-video-audio.mp3');
    const auxiliaryAudioPath: string = join(
      workDir,
      'paired-auxiliary-audio.mp3',
    );
    await Promise.all([
      this.extractAudioTrack(id, input.video.fileName, videoPath, videoAudioPath),
      this.extractAudioTrack(
        id,
        input.auxiliaryAudio.fileName,
        auxiliarySourcePath,
        auxiliaryAudioPath,
      ),
    ]);
    const durationSeconds: number =
      await this.getMediaDurationSeconds(videoPath);
    return {
      auxiliaryAudioPath,
      metadata: {
        duration_string: this.formatDuration(Math.round(durationSeconds)),
        title:
          input.video.fileName.replace(/[.][^.]+$/u, '') ||
          '双源会议或培训',
        uploader: '本地双源文件',
      },
      sourceLabel: '双源会议/培训',
      sourceUrl: [
        `主视频：${input.video.fileName}`,
        `辅助录音：${input.auxiliaryAudio.fileName}`,
      ].join('；'),
      videoAudioPath,
      videoPath,
    };
  }

  private async extractAudioTrack(
    id: string,
    fileName: string,
    sourcePath: string,
    audioPath: string,
  ): Promise<void> {
    await this.measureStep(
      id,
      'extract_paired_audio',
      { fileName },
      () =>
        this.runCommand('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          sourcePath,
          '-vn',
          '-codec:a',
          'libmp3lame',
          '-q:a',
          '5',
          '-y',
          audioPath,
        ]),
    );
  }

  private async resolvePairedAlignment(
    id: string,
    workDir: string,
    media: PreparedPairedMedia,
    input: PairedMediaInput,
  ): Promise<PairedMediaAlignmentResult> {
    if (input.alignment.mode === 'manual') {
      return {
        audioOffsetMs: Math.round(input.alignment.audioOffsetMs || 0),
        score: null,
        status: 'manual',
      };
    }
    this.update(
      id,
      'aligning',
      32,
      '正在比对两路声音并计算时间偏移…',
    );
    const [videoEnvelope, auxiliaryEnvelope]: [number[], number[]] =
      await Promise.all([
        this.createAlignmentEnvelope(
          media.videoAudioPath,
          workDir,
          'video',
        ),
        this.createAlignmentEnvelope(
          media.auxiliaryAudioPath,
          workDir,
          'auxiliary',
        ),
      ]);
    return estimateAudioAlignment(
      videoEnvelope,
      auxiliaryEnvelope,
      ALIGNMENT_BUCKET_MS,
      ALIGNMENT_MAX_OFFSET_MS,
    );
  }

  private async createAlignmentEnvelope(
    audioPath: string,
    workDir: string,
    prefix: string,
  ): Promise<number[]> {
    const rawPath: string = join(workDir, `${prefix}-alignment.pcm`);
    await this.runCommand('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      audioPath,
      '-ac',
      '1',
      '-ar',
      String(ALIGNMENT_SAMPLE_RATE),
      '-f',
      's16le',
      '-codec:a',
      'pcm_s16le',
      '-y',
      rawPath,
    ]);
    const raw: Buffer = await readFile(rawPath);
    const sampleCount: number = Math.floor(raw.byteLength / 2);
    const samples: Int16Array = new Int16Array(
      raw.buffer,
      raw.byteOffset,
      sampleCount,
    );
    return buildEnergyEnvelope(
      samples,
      ALIGNMENT_SAMPLE_RATE,
      ALIGNMENT_BUCKET_MS,
    );
  }

  private async transcribeTimestamped(
    id: string,
    audioPath: string,
    workDir: string,
    prefix: string,
  ): Promise<TranscriptSegment[]> {
    const parts: string[] = await this.splitAudioIfNeeded(
      audioPath,
      workDir,
      prefix,
    );
    const segments: TranscriptSegment[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const outputBase: string = join(
        workDir,
        `${prefix}-transcript-${String(index).padStart(3, '0')}`,
      );
      await this.measureStep(
        id,
        'transcribe_paired_audio',
        {
          part: index + 1,
          partCount: parts.length,
          source: prefix,
        },
        () =>
          this.runCommand('whisper-cli', [
            '--threads',
            String(WHISPER_THREAD_COUNT),
            '--model',
            this.whisperModelPath,
            '--language',
            'zh',
            '--output-json',
            '--output-file',
            outputBase,
            '--no-prints',
            '--file',
            parts[index],
          ]),
      );
      const parsed: TranscriptSegment[] = parseWhisperJson(
        await readFile(`${outputBase}.json`, 'utf8'),
      );
      const partOffsetMs: number = index * TIMESTAMPED_AUDIO_CHUNK_MS;
      segments.push(
        ...parsed.map(
          (segment: TranscriptSegment): TranscriptSegment => ({
            ...segment,
            startMs: segment.startMs + partOffsetMs,
            endMs: segment.endMs + partOffsetMs,
          }),
        ),
      );
    }
    return segments;
  }

  private async getMediaDurationSeconds(mediaPath: string): Promise<number> {
    const result: CommandResult = await this.runCommand('ffprobe', [
      '-v',
      'quiet',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      mediaPath,
    ]);
    const duration: number = Number.parseFloat(result.stdout.trim());
    return Number.isFinite(duration) ? duration : 0;
  }

  private buildPairedSummaryTranscript(
    fused: FusedTranscriptResult,
    alignment: PairedMediaAlignmentResult,
  ): string {
    const qualityNotice: string =
      fused.conflictCount > 0
        ? `发现 ${fused.conflictCount} 个双路冲突片段，涉及数字、术语或不同表述时必须标记“待核对”，不得自行裁决。`
        : '两路转写未发现需要保留的直接冲突。';
    return [
      '## 双源证据说明',
      '',
      `- 辅助录音相对视频时间偏移：${alignment.audioOffsetMs} 毫秒`,
      `- 双路一致片段：${fused.corroboratedCount}`,
      `- 单路证据片段：${fused.singleSourceCount}`,
      `- ${qualityNotice}`,
      '',
      '## 融合时间线',
      '',
      fused.markdown,
    ].join('\n');
  }

  private buildPairedArchiveTranscript(input: {
    alignment: PairedMediaAlignmentResult;
    auxiliaryFileName: string;
    auxiliarySegments: TranscriptSegment[];
    fused: FusedTranscriptResult;
    videoFileName: string;
    videoSegments: TranscriptSegment[];
  }): string {
    const scoreLabel: string =
      input.alignment.score === null
        ? '手动设置'
        : input.alignment.score.toFixed(3);
    return [
      '# 双源融合原文',
      '',
      '> 视频音轨与辅助录音分别转写后按时间对齐。双路冲突会完整保留，不自动猜测。',
      '',
      '## 对齐与质量信息',
      '',
      `- 主视频：${input.videoFileName}`,
      `- 辅助录音：${input.auxiliaryFileName}`,
      `- 辅助录音相对视频偏移：${input.alignment.audioOffsetMs} 毫秒`,
      `- 对齐方式：${input.alignment.status}`,
      `- 对齐相关度：${scoreLabel}`,
      `- 双路一致片段：${input.fused.corroboratedCount}`,
      `- 冲突片段：${input.fused.conflictCount}`,
      `- 单路证据片段：${input.fused.singleSourceCount}`,
      '',
      '## 融合时间线',
      '',
      input.fused.markdown,
      '',
      '## 辅助录音逐段转写',
      '',
      this.formatTranscriptSegments(input.auxiliarySegments),
      '',
      '## 视频音轨逐段转写',
      '',
      this.formatTranscriptSegments(input.videoSegments),
    ].join('\n');
  }

  private formatTranscriptSegments(segments: TranscriptSegment[]): string {
    return segments
      .map(
        (segment: TranscriptSegment): string =>
          `[${this.formatMilliseconds(segment.startMs)}–${this.formatMilliseconds(segment.endMs)}] ${segment.text}`,
      )
      .join('\n\n');
  }

  private formatMilliseconds(valueMs: number): string {
    const totalSeconds: number = Math.max(0, Math.floor(valueMs / 1_000));
    const hours: number = Math.floor(totalSeconds / 3_600);
    const minutes: number = Math.floor((totalSeconds % 3_600) / 60);
    const seconds: number = totalSeconds % 60;
    return [
      hours > 0 ? String(hours).padStart(2, '0') : undefined,
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
    ]
      .filter((part: string | undefined): part is string => Boolean(part))
      .join(':');
  }

  private async mergeAudioFiles(
    audioPaths: string[],
    workDir: string,
  ): Promise<string> {
    if (audioPaths.length === 1) return audioPaths[0];
    const listPath: string = join(workDir, 'audio-concat.txt');
    await writeFile(
      listPath,
      audioPaths.map((audioPath: string) => `file '${audioPath}'`).join('\n'),
      'utf8',
    );
    const mergedPath: string = join(workDir, 'audio-merged.mp3');
    await this.runCommand('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      '-y',
      mergedPath,
    ]);
    return mergedPath;
  }

  private async downloadUploadedMedia(
    id: string,
    media: UploadedMediaInput,
    destination: string,
  ): Promise<void> {
    const parts: UploadedMediaPart[] = media.parts || [
      {
        downloadUrl: media.downloadUrl,
        fileSize: media.fileSize,
      },
    ];
    const completedTemporaryPaths: string[] = [];
    try {
      const temporaryPaths: string[] = await this.measureStep(
        id,
        'download_uploaded_media',
        {
          fileName: media.fileName,
          fileSize: media.fileSize,
          partCount: parts.length,
        },
        () =>
          mapWithConcurrency(
            parts,
            MEDIA_DOWNLOAD_CONCURRENCY,
            async (part: UploadedMediaPart, index: number): Promise<string> => {
              const temporaryPath: string = join(
                dirname(destination),
                `${basename(destination)}.download-${String(index).padStart(3, '0')}`,
              );
              completedTemporaryPaths.push(temporaryPath);
              await this.downloadUploadedMediaPart(part, temporaryPath, 'wx');
              return temporaryPath;
            },
          ),
      );
      for (let index = 0; index < temporaryPaths.length; index += 1) {
        await pipeline(
          createReadStream(temporaryPaths[index]),
          createWriteStream(destination, { flags: index === 0 ? 'wx' : 'a' }),
        );
      }
    } finally {
      await Promise.all(
        completedTemporaryPaths.map((temporaryPath: string) =>
          rm(temporaryPath, { force: true }),
        ),
      );
    }
  }

  private async downloadUploadedMediaPart(
    media: UploadedMediaPart,
    destination: string,
    flags: 'a' | 'wx',
  ): Promise<void> {
    let currentUrl: URL = validateMediaDownloadUrl(media.downloadUrl);
    let response: Response | undefined;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      response = await fetch(currentUrl, { redirect: 'manual' });
      if (response.status < 300 || response.status >= 400) break;
      const location: string | null = response.headers.get('location');
      if (!location || redirectCount === 5) {
        throw new Error('上传文件重定向地址无效');
      }
      currentUrl = validateMediaDownloadUrl(
        new URL(location, currentUrl).toString(),
      );
    }
    if (!response) {
      throw new Error('无法读取上传文件');
    }
    if (!response.ok) {
      throw new Error(`读取上传文件失败（HTTP ${response.status}）`);
    }
    if (!response.body) {
      throw new Error('上传文件没有可读取的内容');
    }
    const maximumBytes: number = Math.min(
      media.fileSize + 1024,
      MAX_MEDIA_SIZE_BYTES,
    );
    let receivedBytes = 0;
    const sizeLimiter = new Transform({
      transform(chunk: Buffer, _encoding: BufferEncoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > maximumBytes) {
          callback(new Error('上传文件大小与声明不一致'));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      sizeLimiter,
      createWriteStream(destination, { flags }),
    );
  }

  private async transcribe(id: string, audioPath: string): Promise<string> {
    const result = await this.measureStep(
      id,
      'transcribe_audio',
      { whisperThreads: WHISPER_THREAD_COUNT },
      () =>
        this.runCommand('whisper-cli', [
          '--threads',
          String(WHISPER_THREAD_COUNT),
          '--model',
          this.whisperModelPath,
          '--language',
          'zh',
          '--no-timestamps',
          '--no-prints',
          '--file',
          audioPath,
        ]),
    );
    return result.stdout.trim();
  }

  private async measureStep<T>(
    id: string,
    operation: string,
    details: Record<string, number | string>,
    action: () => Promise<T>,
  ): Promise<T> {
    const startedAt: number = Date.now();
    try {
      const result: T = await action();
      const durationMs: number = Date.now() - startedAt;
      const fileSize: number | undefined =
        typeof details.fileSize === 'number' ? details.fileSize : undefined;
      const throughputMbps: number | undefined =
        fileSize && durationMs > 0
          ? Number(((fileSize * 8) / durationMs / 1000).toFixed(2))
          : undefined;
      this.logger.log(
        JSON.stringify({
          ...details,
          durationMs,
          ...(throughputMbps ? { throughputMbps } : {}),
          jobId: id,
          operation,
          status: 'completed',
        }),
      );
      return result;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          ...details,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : '未知错误',
          jobId: id,
          operation,
          status: 'failed',
        }),
      );
      throw error;
    }
  }

  private async getYtDlpMetadata(
    url: string,
    sourceArgs: string[],
  ): Promise<VideoMetadata> {
    const result = await this.runCommand('yt-dlp', [
      ...sourceArgs,
      '--no-playlist',
      '--dump-single-json',
      '--skip-download',
      url,
    ]);
    return JSON.parse(result.stdout) as VideoMetadata;
  }

  private async getDouyinMetadata(url: string): Promise<VideoMetadata> {
    const videoId = await this.resolveDouyinVideoId(url);
    const shareUrl = `https://m.douyin.com/share/video/${videoId}/`;
    const response = await fetch(shareUrl, {
      headers: { 'User-Agent': this.getDouyinMobileUserAgent() },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`抖音分享页解析失败（HTTP ${response.status}）`);
    }
    const html = await response.text();
    const marker = 'window._ROUTER_DATA = ';
    const start = html.indexOf(marker);
    const end = start >= 0 ? html.indexOf('</script>', start) : -1;
    if (start < 0 || end < 0) {
      throw new Error('抖音分享页缺少视频数据');
    }
    const routerData = JSON.parse(
      html.slice(start + marker.length, end).trim(),
    ) as {
      loaderData?: Record<
        string,
        {
          videoInfoRes?: {
            item_list?: Array<{
              aweme_id?: string;
              desc?: string;
              author?: { nickname?: string };
              music?: { duration?: number };
              video?: {
                duration?: number;
                play_addr?: { url_list?: string[] };
              };
            }>;
          };
        } | null
      >;
    };
    const pageData = Object.values(routerData.loaderData || {}).find(
      (item) => item?.videoInfoRes?.item_list?.length,
    );
    const video = pageData?.videoInfoRes?.item_list?.[0];
    const mediaUrl = video?.video?.play_addr?.url_list?.[0];
    if (!video || video.aweme_id !== videoId || !mediaUrl) {
      throw new Error('抖音分享页未返回可播放的视频');
    }
    const durationSeconds =
      video.music?.duration ||
      (video.video?.duration
        ? Math.round(video.video.duration / 1000)
        : undefined);
    return {
      title: video.desc,
      uploader: video.author?.nickname,
      duration_string: this.formatDuration(durationSeconds),
      webpage_url: `https://www.douyin.com/video/${videoId}`,
      mediaUrl,
    };
  }

  private async resolveDouyinVideoId(url: string): Promise<string> {
    const directMatch = new URL(url).pathname.match(/\/video\/(\d+)/u);
    if (directMatch) return directMatch[1];
    const response = await fetch(url, {
      headers: { 'User-Agent': this.getDouyinMobileUserAgent() },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`抖音短链解析失败（HTTP ${response.status}）`);
    }
    const html = await response.text();
    const resolvedMatch =
      response.url.match(/\/(?:video|share\/video)\/(\d+)/u) ||
      html.match(/"aweme_id":"(\d+)"/u) ||
      html.match(/\/video\/(\d+)/u);
    if (!resolvedMatch) throw new Error('无法从抖音短链识别视频 ID');
    return resolvedMatch[1];
  }

  private async extractDouyinAudio(
    mediaUrl: string,
    audioPath: string,
  ): Promise<void> {
    const videoPath: string = join(dirname(audioPath), 'douyin-source.mp4');
    await this.downloadDouyinMedia(mediaUrl, videoPath);
    const baseArgs: string[] = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      videoPath,
      '-vn',
    ];
    const outputArgs: string[] = [
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '5',
      '-y',
      audioPath,
    ];
    try {
      await this.runCommand('ffmpeg', [...baseArgs, ...outputArgs]);
    } catch (error) {
      const message: string =
        error instanceof Error ? error.message : '未知错误';
      if (!isAudioRematrixError(message)) throw error;
      this.logger.warn('抖音音频声道布局异常，正在使用显式双声道映射重试');
      await this.runCommand('ffmpeg', [
        ...baseArgs,
        ...getDouyinAudioFallbackArgs(),
        ...outputArgs,
      ]);
    }
  }

  private async downloadDouyinMedia(
    mediaUrl: string,
    destination: string,
  ): Promise<void> {
    const maxAttempts: number = DOUYIN_MEDIA_RETRY_DELAYS_MS.length + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await rm(destination, { force: true });
      try {
        const response: Response = await fetch(mediaUrl, {
          headers: {
            Accept: '*/*',
            'Accept-Encoding': 'identity',
            Referer: 'https://www.douyin.com/',
            'User-Agent': this.getDouyinMobileUserAgent(),
          },
          redirect: 'follow',
        });
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}：抖音播放流不可用`);
        }
        validateMediaDownloadUrl(response.url);
        await pipeline(
          Readable.fromWeb(response.body),
          createWriteStream(destination),
        );
        const downloadedMedia = await stat(destination);
        if (downloadedMedia.size === 0) {
          throw new Error('抖音播放流返回空文件');
        }
        return;
      } catch (error) {
        const message: string =
          error instanceof Error ? error.message : '未知网络错误';
        const retryDelay: number | undefined =
          DOUYIN_MEDIA_RETRY_DELAYS_MS[attempt - 1];
        if (!retryDelay || !isDouyinTransientMediaError(message)) {
          throw error;
        }
        this.logger.warn(
          `抖音播放流连接中断，第 ${attempt}/${maxAttempts} 次下载失败，${retryDelay / 1000} 秒后自动重试: ${message}`,
        );
        await this.delay(retryDelay);
      }
    }
  }

  private getDouyinMobileUserAgent(): string {
    return 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1';
  }

  private formatDuration(seconds?: number): string | undefined {
    if (!seconds) return undefined;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  private async splitAudioIfNeeded(
    audioPath: string,
    workDir: string,
    prefix = 'chunk',
  ): Promise<string[]> {
    const audioStat = await stat(audioPath);
    if (audioStat.size <= 24 * 1024 * 1024) return [audioPath];

    const chunkTemplate = join(workDir, `${prefix}-%03d.mp3`);
    await this.runCommand('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      audioPath,
      '-f',
      'segment',
      '-segment_time',
      '1200',
      '-c',
      'copy',
      chunkTemplate,
    ]);
    const chunks = (await readdir(workDir))
      .filter((name: string) =>
        new RegExp(`^${prefix}-\\d+[.]mp3$`, 'u').test(name),
      )
      .sort()
      .map((name) => join(workDir, name));
    if (!chunks.length) throw new Error('长音频自动切片失败');
    return chunks;
  }

  private async summarize(input: {
    transcript: string;
    editorResearch: string;
    noteStyle: NoteStyle;
    styleRequirements: string;
    title: string;
    uploader: string;
    duration: string;
    sourceUrl: string;
    sourceLabel: string;
    generatedDate: string;
  }): Promise<string> {
    const pluginInstanceId = 'bilibili-note-writer';
    const actionKey = 'textGenerate';
    const pluginInput = {
      source_platform: input.sourceLabel,
      source_text: input.transcript,
      video_title: input.title,
      uploader: input.uploader,
      duration: input.duration,
      source_url: input.sourceUrl,
      generated_date: input.generatedDate,
      editor_research: input.editorResearch,
      note_style:
        input.noteStyle === 'learning' ? 'systematic' : input.noteStyle,
      style_requirements: input.styleRequirements,
    };
    try {
      const streamResult = await this.capabilityService
        .load(pluginInstanceId)
        .callStream(actionKey, pluginInput);
      const markdown = await this.collectCapabilityText(streamResult, [
        'content',
        'response',
      ]);
      if (!markdown.trim()) throw new Error('妙搭内置 AI 没有返回学习笔记');
      return markdown;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          pluginInstanceId,
          actionKey,
          outputMode: 'stream',
          inputKeys: Object.keys(pluginInput),
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      throw new Error(
        `妙搭内置 AI 生成笔记失败：${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }

  private async parseDocument(downloadUrl: string): Promise<string> {
    const pluginInstanceId = 'pdf-document-parser';
    const actionKey = 'parseDocToMarkdown';
    const outputMode = 'unary';
    const pluginInput = { file_url: [downloadUrl] };
    try {
      const result = (await this.capabilityService
        .load(pluginInstanceId)
        .call(actionKey, pluginInput)) as { content?: unknown };
      if (typeof result.content !== 'string' || !result.content.trim()) {
        throw new Error('文档解析插件没有返回可用文本');
      }
      return result.content.trim();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          pluginInstanceId,
          actionKey,
          outputMode,
          inputKeys: Object.keys(pluginInput),
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      throw new Error(
        `文档解析失败：${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }

  private async summarizeDocument(input: {
    content: string;
    editorResearch: string;
    fileHash: string;
    fileName: string;
    generatedDate: string;
    noteStyle: NoteStyle;
    styleRequirements: string;
    parseQuality: 'parsed' | 'needs_ocr' | 'needs_review';
    sourceUrl: string;
    title: string;
  }): Promise<string> {
    const pluginInstanceId = 'pdf-note-writer';
    const actionKey = 'textGenerate';
    const pluginInput = {
      source_text: input.content,
      document_title: input.title,
      file_name: input.fileName,
      file_hash: input.fileHash,
      source_url: input.sourceUrl,
      generated_date: input.generatedDate,
      parse_quality: input.parseQuality,
      editor_research: input.editorResearch,
      note_style: input.noteStyle,
      style_requirements: input.styleRequirements,
    };
    try {
      const streamResult = await this.capabilityService
        .load(pluginInstanceId)
        .callStream(actionKey, pluginInput);
      const markdown = await this.collectCapabilityText(streamResult, [
        'content',
        'response',
      ]);
      if (!markdown.trim()) throw new Error('文档笔记插件没有返回内容');
      return markdown.trim();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          pluginInstanceId,
          actionKey,
          outputMode: 'stream',
          inputKeys: Object.keys(pluginInput),
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      throw new Error(
        `文档学习笔记生成失败：${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
    }
  }

  private async reviewDocumentNote(input: {
    draftNote: string;
    noteStyle: NoteStyle;
    styleRequirements: string;
    sourceText: string;
  }): Promise<string> {
    const pluginInstanceId = 'pdf-note-quality-reviewer';
    const actionKey = 'textGenerate';
    const pluginInput: Record<string, unknown> = {
      draft_note: input.draftNote,
      note_style: input.noteStyle,
      source_text: input.sourceText,
      style_requirements: input.styleRequirements,
    };
    try {
      return await this.callCapabilityTextWithRateLimitRetry({
        pluginInstanceId,
        actionKey,
        outputMode: 'stream',
        pluginInput,
        textFields: ['content', 'response'],
        emptyResultMessage: '文档质量审核插件没有返回内容',
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          pluginInstanceId,
          actionKey,
          outputMode: 'stream',
          inputKeys: Object.keys(pluginInput),
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      if (this.isCapabilityRateLimitError(error)) {
        this.logger.warn(
          JSON.stringify({
            pluginInstanceId,
            actionKey,
            outputMode: 'stream',
            fallback: 'draft_note',
            reason: this.getErrorMessage(error),
          }),
        );
        return input.draftNote.trim();
      }
      throw new Error(
        `文档笔记质量审核失败：${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
    }
  }

  private async reviewNoteQuality(input: {
    draftNote: string;
    noteStyle: NoteStyle;
    styleRequirements: string;
    transcript: string;
  }): Promise<string> {
    const pluginInstanceId = 'note-quality-reviewer';
    const actionKey = 'textGenerate';
    const outputMode = 'stream';
    const pluginInput: Record<string, unknown> = {
      draft_note: input.draftNote,
      note_style: input.noteStyle,
      source_text: input.transcript,
      style_requirements: input.styleRequirements,
    };
    try {
      return await this.callCapabilityTextWithRateLimitRetry({
        pluginInstanceId,
        actionKey,
        outputMode,
        pluginInput,
        textFields: ['content', 'response'],
        emptyResultMessage: '质量审核插件没有返回修订后的笔记',
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          pluginInstanceId,
          actionKey,
          outputMode,
          inputKeys: Object.keys(pluginInput),
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      if (this.isCapabilityRateLimitError(error)) {
        this.logger.warn(
          JSON.stringify({
            pluginInstanceId,
            actionKey,
            outputMode,
            fallback: 'draft_note',
            reason: this.getErrorMessage(error),
          }),
        );
        return input.draftNote.trim();
      }
      throw new Error(
        `笔记质量审核失败：${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
    }
  }

  private async researchEvidence(
    title: string,
    transcript: string,
  ): Promise<string> {
    const pluginInstanceId = 'note-evidence-research';
    const actionKey = 'searchSummary';
    const outputMode = 'stream';
    const compactTranscript = transcript.replace(/\s+/gu, ' ').trim();
    const excerptSize = 120;
    const middleStart = Math.max(
      0,
      Math.floor(compactTranscript.length / 2) - excerptSize / 2,
    );
    const researchQuery = [
      `主题：${title}`,
      `开头：${compactTranscript.slice(0, excerptSize)}`,
      `中段：${compactTranscript.slice(middleStart, middleStart + excerptSize)}`,
      `结尾：${compactTranscript.slice(-excerptSize)}`,
    ]
      .join('\n')
      .slice(0, 500);
    const pluginInput = { research_query: researchQuery };
    try {
      const streamResult = await this.capabilityService
        .load(pluginInstanceId)
        .callStream(actionKey, pluginInput);
      const stream = this.normalizeCapabilityStream(streamResult);
      let summary = '';
      for await (const chunk of stream) {
        const delta = typeof chunk.summary === 'string' ? chunk.summary : '';
        if (!delta) continue;
        summary = delta.startsWith(summary) ? delta : summary + delta;
      }
      if (!summary.trim()) throw new Error('搜索插件没有返回研究材料');
      return summary.trim();
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          pluginInstanceId,
          actionKey,
          outputMode,
          inputKeys: Object.keys(pluginInput),
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      return '未获得可核验的联网研究材料。本次不要添加任何外部补充内容。';
    }
  }

  private normalizeCapabilityStream(
    value: unknown,
  ): AsyncIterable<Record<string, unknown>> {
    if (this.isCapabilityStream(value)) return value;
    if (value && typeof value === 'object' && 'output' in value) {
      const output = (value as { output?: unknown }).output;
      if (this.isCapabilityStream(output)) return output;
    }
    throw new Error('搜索插件未返回可读取的数据流');
  }

  private async callCapabilityTextWithRateLimitRetry(
    input: CapabilityTextRetryInput,
  ): Promise<string> {
    for (
      let attemptIndex = 0;
      attemptIndex <= CAPABILITY_RATE_LIMIT_RETRY_DELAYS_MS.length;
      attemptIndex += 1
    ) {
      try {
        const streamResult = await this.capabilityService
          .load(input.pluginInstanceId)
          .callStream(input.actionKey, input.pluginInput);
        const text = await this.collectCapabilityText(
          streamResult,
          input.textFields,
        );
        if (!text.trim()) throw new Error(input.emptyResultMessage);
        return text.trim();
      } catch (error) {
        const retryDelayMs =
          CAPABILITY_RATE_LIMIT_RETRY_DELAYS_MS[attemptIndex];
        const shouldRetry =
          retryDelayMs !== undefined && this.isCapabilityRateLimitError(error);

        if (!shouldRetry) throw error;

        this.logger.warn(
          JSON.stringify({
            pluginInstanceId: input.pluginInstanceId,
            actionKey: input.actionKey,
            outputMode: input.outputMode,
            attempt: attemptIndex + 1,
            retryDelayMs,
            error: this.getErrorMessage(error),
          }),
        );
        await this.delay(retryDelayMs);
      }
    }

    throw new Error('插件限流重试失败');
  }

  private async collectCapabilityText(
    value: unknown,
    fields: readonly string[],
  ): Promise<string> {
    const stream = this.normalizeCapabilityStream(value);
    let content = '';
    for await (const chunk of stream) {
      const delta = fields
        .map((field: string) => chunk[field])
        .find((candidate: unknown) => typeof candidate === 'string');
      if (typeof delta !== 'string' || !delta) continue;
      content = delta.startsWith(content) ? delta : content + delta;
    }
    return content;
  }

  private isCapabilityRateLimitError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return (
      message.includes('请求过于频繁') ||
      message.includes('稍后再试') ||
      message.includes('too many requests') ||
      message.includes('rate limit') ||
      message.includes('throttl') ||
      message.includes('429')
    );
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }

  private async delay(delayMs: number): Promise<void> {
    await new Promise<void>((resolve: () => void) => {
      setTimeout(resolve, delayMs);
    });
  }

  private isCapabilityStream(
    value: unknown,
  ): value is AsyncIterable<Record<string, unknown>> {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as {
      [Symbol.asyncIterator]?: unknown;
    };
    return typeof candidate[Symbol.asyncIterator] === 'function';
  }

  private async generateKnowledgeMap(
    markdown: string,
  ): Promise<string | undefined> {
    const pluginInstanceId = 'note-knowledge-map';
    const actionKey = 'textToImage';
    const outputMode = 'unary';
    const pluginInput = { note_content: markdown };
    try {
      const result = (await this.capabilityService
        .load(pluginInstanceId)
        .call(actionKey, pluginInput)) as { images?: string[] };
      const imageUrl = result.images?.find((image) =>
        /^https?:\/\//u.test(image),
      );
      if (!imageUrl) throw new Error('图片插件没有返回有效图片地址');
      return imageUrl;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          pluginInstanceId,
          actionKey,
          outputMode,
          inputKeys: Object.keys(pluginInput),
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      return undefined;
    }
  }

  private insertKnowledgeMap(markdown: string, imageUrl: string): string {
    const section = [
      '## 知识框架图',
      '',
      `![知识框架图](${imageUrl})`,
      '',
      '> AI 生成的认知地图用于辅助理解，具体知识以正文为准。',
      '',
    ].join('\n');
    const nextSection = markdown.search(/^## 2[.、]\s*/mu);
    if (nextSection < 0) return `${markdown.trim()}\n\n${section}`;
    return `${markdown.slice(0, nextSection)}${section}${markdown.slice(nextSection)}`;
  }

  private extractMarkdownTitle(markdown: string): string | undefined {
    const title = markdown.match(/^#\s+(.+)$/mu)?.[1].trim();
    return title || undefined;
  }

  private async createLarkDocument(
    title: string,
    markdown: string,
  ): Promise<string> {
    const safeTitle = title.slice(0, 120);
    const result = await this.runCommand(
      'lark-cli',
      [
        'docs',
        '+create',
        '--as',
        'user',
        '--doc-format',
        'markdown',
        '--title',
        safeTitle,
        '--content',
        '-',
        '--json',
      ],
      markdown,
    );
    const parsed = JSON.parse(result.stdout) as {
      ok?: boolean;
      data?: { document?: { url?: string } };
      error?: { message?: string; hint?: string };
    };
    if (!parsed.ok || !parsed.data?.document?.url) {
      throw new Error(
        parsed.error?.hint || parsed.error?.message || '飞书文档创建失败',
      );
    }
    return parsed.data.document.url;
  }

  private async extractAndUploadFrames(
    id: string,
    workDir: string,
    videoPath: string,
  ): Promise<KeyFrame[]> {
    try {
      this.update(id, 'extracting-frames', 38, '正在提取视频关键画面…');
      const rawFrames = await this.frameExtractionService.extractKeyFrames(videoPath, workDir);
      if (rawFrames.length === 0) return [];
      
      this.update(id, 'uploading-frames', 41, `正在上传 ${rawFrames.length} 张截图…`);
      const uploadedFrames = await this.frameUploadService.uploadFrames(rawFrames);
      
      this.update(id, 'analyzing-frames', 43, '正在 AI 识别截图内容…');
      const enhancedFrames = await this.frameAiEnhanceService.enhanceFrames(uploadedFrames);
      
      return enhancedFrames;
    } catch (err) {
      this.logger.warn(`帧提取流程失败，继续不含截图: ${String(err)}`);
      return [];
    }
  }

  private async findVideoPath(workDir: string): Promise<string | undefined> {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(workDir);
      const videoFile = files.find((f) =>
        /\.(mp4|mkv|mov|webm|avi|flv|ts)$/iu.test(f) && !f.includes('audio'),
      );
      return videoFile ? join(workDir, videoFile) : undefined;
    } catch {
      return undefined;
    }
  }

  private async createRawTranscriptDocument(input: {
    duration: string;
    generatedDate: string;
    sourceLabel: string;
    sourceUrl: string;
    title: string;
    transcript: string;
    uploader: string;
  }): Promise<string | undefined> {
    const rawTitle = buildRawDocumentTitle(input.title);
    const rawMarkdown = buildRawTranscriptMarkdown(input);
    try {
      return await this.createLarkDocument(rawTitle, rawMarkdown);
    } catch (error) {
      this.logger.warn(
        `创建任务原文档案失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
      return undefined;
    }
  }

  private async createRawDocumentArchive(input: {
    generatedDate: string;
    items: Array<{
      content: string;
      fileHash: string;
      fileName: string;
      parseQuality: 'parsed' | 'needs_ocr' | 'needs_review';
      sourceUrl: string;
    }>;
  }): Promise<string | undefined> {
    const title: string =
      input.items.length > 1
        ? `多文档原文（${input.items.length} 个文件）`
        : input.items[0].fileName.replace(/[.][^.]+$/u, '') || '文档原文';
    try {
      return await this.createLarkDocument(
        buildRawDocumentTitle(title),
        buildDocumentRawMarkdown(input),
      );
    } catch (error) {
      this.logger.warn(
        `创建文档原文档案失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
      return undefined;
    }
  }

  private appendRawDocumentReference(
    markdown: string,
    rawDocumentUrl: string,
  ): string {
    const section = [
      '## 原文归档',
      '',
      `- [查看完整原文](${rawDocumentUrl})`,
      '',
      '> 原文文档保留完整转录，可直接复制或下载。',
      '',
    ].join('\n');
    return `${markdown.trim()}\n\n${section}`;
  }

  private resolveSourcePlatform(value?: string): SourcePlatform {
    if (!value || value === 'bilibili') return 'bilibili';
    if (value === 'douyin') return 'douyin';
    throw new BadRequestException('不支持的视频平台');
  }

  private getSourceLabel(platform: SourcePlatform): string {
    return SOURCE_PROFILES[platform].label;
  }

  private validateCookieBrowser(
    value?: string,
  ): CreateNoteJobRequest['cookieBrowser'] | undefined {
    if (!value) return undefined;
    const supported = ['chrome', 'safari', 'edge', 'firefox'] as const;
    if (!supported.includes(value as (typeof supported)[number])) {
      throw new BadRequestException('不支持的浏览器登录态来源');
    }
    return value as CreateNoteJobRequest['cookieBrowser'];
  }

  private async buildSourceArgs(
    platform: SourcePlatform,
    cookieBrowser?: CreateNoteJobRequest['cookieBrowser'],
  ): Promise<string[]> {
    const profile = SOURCE_PROFILES[platform];
    const args = [
      '--no-update',
      '--referer',
      profile.referer,
      '--add-header',
      `Origin:${profile.origin}`,
      '--retries',
      '3',
      '--fragment-retries',
      '3',
    ];
    if (cookieBrowser) {
      const browserSpec = await this.resolveCookieBrowserSpec(cookieBrowser);
      args.push('--cookies-from-browser', browserSpec);
    }
    return args;
  }

  private async resolveCookieBrowserSpec(
    browser: NonNullable<CreateNoteJobRequest['cookieBrowser']>,
  ): Promise<string> {
    if (browser !== 'chrome') return browser;
    const localStatePath = join(
      homedir(),
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'Local State',
    );
    try {
      const localState = JSON.parse(await readFile(localStatePath, 'utf8')) as {
        profile?: { last_used?: string };
      };
      const profile = localState.profile?.last_used;
      if (profile && /^(Default|Profile \d+)$/u.test(profile)) {
        this.logger.log(`使用 Chrome Cookie 配置：${profile}`);
        return `chrome:${profile}`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`无法识别 Chrome 当前配置，将使用默认配置：${message}`);
    }
    return browser;
  }

  private friendlyDownloadError(
    message: string,
    platform: SourcePlatform,
    cookieBrowser?: CreateNoteJobRequest['cookieBrowser'],
  ): string {
    const profile = SOURCE_PROFILES[platform];
    if (message.includes('HTTP Error 412')) {
      return cookieBrowser
        ? `${profile.label}仍拒绝了请求（HTTP 412）。请先在 ${cookieBrowser} 中打开 ${profile.label} 并确认已登录，然后关闭无痕窗口后重试。`
        : `${profile.label}拒绝了匿名请求（HTTP 412）。请在页面选择一个已经登录 ${profile.label} 的浏览器后重试。`;
    }
    if (/fresh cookies.*needed/iu.test(message)) {
      return cookieBrowser
        ? `抖音 Cookie 已失效。请在 ${cookieBrowser} 普通窗口打开 douyin.com 并刷新一次页面，再回到这里重试。无需登录，但不能使用无痕窗口。`
        : '抖音需要近期浏览器 Cookie。请先在普通浏览器窗口打开 douyin.com，再选择该浏览器并重试。';
    }
    if (
      message.includes('cookies') &&
      (message.includes('Permission') ||
        message.includes('decrypt') ||
        message.includes('keyring'))
    ) {
      return `无法读取浏览器登录状态。请允许终端访问浏览器数据/钥匙串，或改选另一个已登录 ${profile.label} 的浏览器。`;
    }
    if (platform === 'douyin' && isDouyinTransientMediaError(message)) {
      return '抖音播放流连接被上游提前关闭，已自动重试 3 次仍未成功。请稍后重新提交；若持续发生，请在普通浏览器打开 douyin.com 后选择该浏览器再试。';
    }
    return message;
  }

  private update(
    id: string,
    stage: JobStage,
    progress: number,
    message: string,
  ) {
    this.patch(id, { stage, progress, message });
  }

  private patch(id: string, update: Partial<NoteJob>) {
    const current = this.jobs.get(id);
    if (!current) return;
    this.jobs.set(id, {
      ownerId: current.ownerId,
      larkUserId: current.larkUserId,
      job: {
        ...current.job,
        ...update,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  private async createReviewTask(
    jobId: string,
    title: string,
    documentUrl: string,
    larkUserId?: string | null,
  ): Promise<void> {
    if (!larkUserId) {
      await this.noteHistoryService.updateReviewTaskFailure(
        jobId,
        '无法识别当前用户的飞书账号，未创建待处理任务',
      );
      this.patch(jobId, { message: '笔记已创建，但待处理任务未创建' });
      return;
    }
    try {
      const task = await this.noteReviewTaskService.create({
        documentUrl,
        jobId,
        larkUserId,
        title,
      });
      await this.noteHistoryService.updateReviewTask(jobId, task);
      this.patch(jobId, { message: '完成！飞书笔记和待处理任务已创建。' });
    } catch (error) {
      const message: string =
        error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`创建任务 ${jobId} 的飞书待处理任务失败: ${message}`);
      await this.noteHistoryService
        .updateReviewTaskFailure(jobId, message)
        .catch((historyError: unknown) => {
          const historyMessage: string =
            historyError instanceof Error ? historyError.message : '未知错误';
          this.logger.warn(
            `保存任务 ${jobId} 的待处理任务失败状态失败: ${historyMessage}`,
          );
        });
      this.patch(jobId, { message: '笔记已创建，但待处理任务未创建' });
    }
  }

  private async persistTitle(id: string, title: string): Promise<void> {
    try {
      await this.noteHistoryService.updateTitle(id, title);
    } catch (error) {
      this.logger.warn(
        `更新任务 ${id} 的历史主题失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
    }
  }

  private async persistRawDocument(
    id: string,
    rawDocumentUrl: string,
  ): Promise<void> {
    try {
      await this.noteHistoryService.updateRawDocumentUrl(id, rawDocumentUrl);
    } catch (error) {
      this.logger.warn(
        `更新任务 ${id} 的原文链接失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
    }
  }

  private async persistRawTranscript(
    id: string,
    transcript: string,
  ): Promise<void> {
    try {
      await this.noteHistoryService.updateRawTranscript(id, transcript);
    } catch (error) {
      this.logger.warn(
        `保存任务 ${id} 的原文内容失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
    }
  }

  private async persistFinish(
    id: string,
    result: {
      status: 'completed' | 'failed';
      documentUrl?: string;
      rawDocumentUrl?: string;
      error?: string;
    },
  ): Promise<void> {
    const stored: StoredNoteJob | undefined = this.jobs.get(id);
    if (!stored) return;
    try {
      await this.noteHistoryService.finish({
        jobId: id,
        startedAt: new Date(stored.job.createdAt),
        completedAt: new Date(),
        status: result.status,
        documentUrl: result.documentUrl,
        rawDocumentUrl: result.rawDocumentUrl || stored.job.rawDocumentUrl,
        error: result.error,
      });
    } catch (error) {
      this.logger.warn(
        `更新任务 ${id} 的历史状态失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
    }
  }

  private commandExists(command: string): Promise<boolean> {
    return this.runCommand('which', [command])
      .then(() => true)
      .catch(() => false);
  }

  private fileExists(path: string): Promise<boolean> {
    return access(path)
      .then(() => true)
      .catch(() => false);
  }

  private runCommand(
    command: string,
    args: string[],
    stdin?: string,
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(new Error(this.commandError(command, stderr, stdout, code)));
      });
      if (stdin) child.stdin.end(stdin);
      else child.stdin.end();
    });
  }

  private commandError(
    command: string,
    stderr: string,
    stdout: string,
    code: number | null,
  ) {
    const raw = (stderr || stdout).trim();
    try {
      const parsed = JSON.parse(raw) as {
        error?: { hint?: string; message?: string };
      };
      return (
        parsed.error?.hint || parsed.error?.message || `${command} 执行失败`
      );
    } catch {
      return (
        raw.split('\n').slice(-5).join('\n') || `${command} 执行失败（${code}）`
      );
    }
  }
}
