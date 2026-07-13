import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  CreateNoteJobRequest,
  JobStage,
  NoteJob,
  NoteStyle,
  NoteSourceType,
  SourcePlatform,
  SystemReadiness,
  UploadedMediaPart,
  UploadedMediaInput,
} from '@shared/api.interface';
import {
  getDouyinAudioFallbackArgs,
  isAudioRematrixError,
  MAX_MEDIA_SIZE_BYTES,
  normalizePlatformSourceUrl,
  validateMediaDownloadUrl,
  validateNoteJobRequest,
} from './note-jobs.utils';
import {
  buildRawDocumentTitle,
  buildRawTranscriptMarkdown,
} from './note-document.utils';
import { NoteHistoryService } from './note-history.service';
import { buildPdfRawMarkdown, getParseQuality } from './pdf-note.utils';
import { NoteTemplateService } from './note-template.service';

type CommandResult = { stdout: string; stderr: string };

interface VideoMetadata {
  title?: string;
  uploader?: string;
  webpage_url?: string;
  duration_string?: string;
  mediaUrl?: string;
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
  ownerId: string;
}

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
    private readonly noteHistoryService: NoteHistoryService,
    private readonly noteTemplateService: NoteTemplateService,
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
      pdfReady: larkCli,
    };
  }

  async create(input: CreateNoteJobRequest, ownerId: string): Promise<NoteJob> {
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
            : 'PDF 资料';
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
          : validatedInput.media.fileName,
      createdAt: now,
      updatedAt: now,
    };
    await this.noteHistoryService.create(job, ownerId);
    this.jobs.set(job.id, { job, ownerId });
    void this.run(
      job.id,
      validatedInput,
      ownerId,
      sourcePlatform,
      cookieBrowser,
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
  ) {
    const workDir = await mkdtemp(join(tmpdir(), 'video-note-'));
    try {
      this.update(id, 'checking', 6, '正在检查本机依赖…');
      const readiness = await this.getReadiness();
      if (!readiness.larkCli) {
        throw new Error('未找到 lark-cli，请先安装并登录飞书');
      }
      if (input.sourceType === 'pdf') {
        await this.runPdf(id, workDir, input, ownerId);
        return;
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
      const preparedMedia =
        input.sourceType === 'platform'
          ? await this.preparePlatformMedia(
              id,
              workDir,
              input.url,
              sourcePlatform,
              cookieBrowser,
            )
          : await this.prepareUploadedMedia(id, workDir, input);
      const { audioPath, metadata, sourceUrl, sourceLabel } = preparedMedia;
      const videoTitle = metadata.title || `${sourceLabel}学习笔记`;
      this.patch(id, { videoTitle });
      await this.persistTitle(id, videoTitle);
      this.update(id, 'transcribing', 44, '音频已就绪，正在转成文字…');
      const audioParts = await this.splitAudioIfNeeded(audioPath, workDir);
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
        transcripts.push(await this.transcribe(audioParts[index]));
      }
      const transcript = transcripts.join('\n\n');
      if (!transcript.trim()) throw new Error('转录结果为空');

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
        transcript,
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
      const styleRequirements = await this.noteTemplateService.getContent(
        ownerId,
        input.noteStyle,
      );
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
      const knowledgeMapUrl = await this.generateKnowledgeMap(reviewedMarkdown);
      const summaryMarkdown = knowledgeMapUrl
        ? this.insertKnowledgeMap(reviewedMarkdown, knowledgeMapUrl)
        : reviewedMarkdown;
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

  private async runPdf(
    id: string,
    workDir: string,
    input: Extract<
      ReturnType<typeof validateNoteJobRequest>,
      { sourceType: 'pdf' }
    >,
    ownerId: string,
  ): Promise<void> {
    this.update(id, 'preparing', 14, '正在安全读取 PDF 文件…');
    const sourcePath: string = join(workDir, 'source.pdf');
    await this.downloadUploadedMedia(input.media, sourcePath);
    const fileHash: string = createHash('sha256')
      .update(await readFile(sourcePath))
      .digest('hex');
    const title: string =
      input.media.fileName.replace(/[.][^.]+$/u, '') || 'PDF 学习资料';
    this.patch(id, { fileHash, videoTitle: title });
    await this.persistTitle(id, title);

    this.update(id, 'parsing', 28, '正在解析 PDF 文本与文档结构…');
    const parsedContent: string = await this.parsePdf(input.media.downloadUrl);
    const parseQuality = getParseQuality(parsedContent);
    this.patch(id, { parseQuality });
    this.update(
      id,
      'publishing',
      42,
      parseQuality === 'parsed'
        ? 'PDF 文本解析完成，正在归档原文…'
        : 'PDF 文本质量需人工核对，正在保留可追溯原文…',
    );
    const generatedDate: string = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const rawDocumentUrl = await this.createRawPdfDocument({
      content: parsedContent,
      fileHash,
      fileName: input.media.fileName,
      generatedDate,
      parseQuality,
      sourceUrl: input.media.downloadUrl,
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
    const styleRequirements = await this.noteTemplateService.getContent(
      ownerId,
      input.noteStyle,
    );
    const markdown: string = await this.summarizePdf({
      content: parsedContent,
      editorResearch,
      fileHash,
      fileName: input.media.fileName,
      generatedDate,
      noteStyle: input.noteStyle,
      styleRequirements,
      parseQuality,
      sourceUrl: input.media.downloadUrl,
      title,
    });
    this.update(id, 'summarizing', 78, '正在核验笔记与 PDF 原文的一致性…');
    const reviewedMarkdown: string = await this.reviewPdfNote({
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
      message: '完成！PDF 学习笔记已创建。',
      rawDocumentUrl,
      documentUrl,
    });
    await this.persistFinish(id, {
      status: 'completed',
      rawDocumentUrl,
      documentUrl,
    });
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
        '--output',
        join(workDir, 'audio.%(ext)s'),
        url,
      ]);
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
    input: Exclude<
      ReturnType<typeof validateNoteJobRequest>,
      { sourceType: 'platform' }
    >,
  ): Promise<{
    audioPath: string;
    metadata: VideoMetadata;
    sourceUrl: string;
    sourceLabel: string;
  }> {
    const sourceLabel: string =
      input.sourceType === 'video' ? '本地视频' : '录音文件';
    this.update(id, 'preparing', 14, `正在读取${sourceLabel}…`);
    const extension: string =
      input.media.fileName
        .split('.')
        .pop()
        ?.replace(/[^a-z0-9]/giu, '') || 'media';
    const sourcePath: string = join(workDir, `source.${extension}`);
    await this.downloadUploadedMedia(input.media, sourcePath);

    const audioPath: string = join(workDir, 'audio.mp3');
    this.update(
      id,
      'preparing',
      30,
      input.sourceType === 'video'
        ? '视频已上传，正在提取音轨…'
        : '录音已上传，正在统一音频格式…',
    );
    await this.runCommand('ffmpeg', [
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
    ]);
    return {
      audioPath,
      metadata: {
        title: input.media.fileName.replace(/[.][^.]+$/u, ''),
        uploader: '本地文件',
      },
      sourceUrl: '用户上传的本地文件',
      sourceLabel,
    };
  }

  private async downloadUploadedMedia(
    media: UploadedMediaInput,
    destination: string,
  ): Promise<void> {
    const parts: UploadedMediaPart[] = media.parts || [
      {
        downloadUrl: media.downloadUrl,
        fileSize: media.fileSize,
      },
    ];
    for (let index = 0; index < parts.length; index += 1) {
      await this.downloadUploadedMediaPart(
        parts[index],
        destination,
        index === 0 ? 'wx' : 'a',
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

  private async transcribe(audioPath: string): Promise<string> {
    const result = await this.runCommand('whisper-cli', [
      '--no-gpu',
      '--model',
      this.whisperModelPath,
      '--language',
      'zh',
      '--no-timestamps',
      '--no-prints',
      '--file',
      audioPath,
    ]);
    return result.stdout.trim();
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
    const baseArgs: string[] = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-user_agent',
      this.getDouyinMobileUserAgent(),
      '-referer',
      'https://www.iesdouyin.com/',
      '-i',
      mediaUrl,
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
  ): Promise<string[]> {
    const audioStat = await stat(audioPath);
    if (audioStat.size <= 24 * 1024 * 1024) return [audioPath];

    const chunkTemplate = join(workDir, 'chunk-%03d.mp3');
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
      .filter((name) => /^chunk-\d+\.mp3$/.test(name))
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

  private async parsePdf(downloadUrl: string): Promise<string> {
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
        `PDF 解析失败：${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }

  private async summarizePdf(input: {
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
      if (!markdown.trim()) throw new Error('PDF 笔记插件没有返回内容');
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
        `PDF 学习笔记生成失败：${
          error instanceof Error ? error.message : '未知错误'
        }`,
      );
    }
  }

  private async reviewPdfNote(input: {
    draftNote: string;
    noteStyle: NoteStyle;
    styleRequirements: string;
    sourceText: string;
  }): Promise<string> {
    const pluginInstanceId = 'pdf-note-quality-reviewer';
    const actionKey = 'textGenerate';
    const pluginInput = {
      draft_note: input.draftNote,
      note_style: input.noteStyle,
      source_text: input.sourceText,
      style_requirements: input.styleRequirements,
    };
    try {
      const streamResult = await this.capabilityService
        .load(pluginInstanceId)
        .callStream(actionKey, pluginInput);
      const reviewedNote = await this.collectCapabilityText(streamResult, [
        'content',
        'response',
      ]);
      if (!reviewedNote.trim()) throw new Error('PDF 质量审核插件没有返回内容');
      return reviewedNote.trim();
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
        `PDF 笔记质量审核失败：${
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
    const pluginInput = {
      draft_note: input.draftNote,
      note_style: input.noteStyle,
      source_text: input.transcript,
      style_requirements: input.styleRequirements,
    };
    try {
      const streamResult = await this.capabilityService
        .load(pluginInstanceId)
        .callStream(actionKey, pluginInput);
      const reviewedNote = await this.collectCapabilityText(streamResult, [
        'content',
        'response',
      ]);
      if (!reviewedNote.trim()) {
        throw new Error('质量审核插件没有返回修订后的笔记');
      }
      return reviewedNote.trim();
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

  private async createRawPdfDocument(input: {
    content: string;
    fileHash: string;
    fileName: string;
    generatedDate: string;
    parseQuality: 'parsed' | 'needs_ocr' | 'needs_review';
    sourceUrl: string;
  }): Promise<string | undefined> {
    const title: string =
      input.fileName.replace(/[.][^.]+$/u, '') || 'PDF 原文';
    try {
      return await this.createLarkDocument(
        buildRawDocumentTitle(title),
        buildPdfRawMarkdown(input),
      );
    } catch (error) {
      this.logger.warn(
        `创建 PDF 原文档案失败: ${
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
      job: {
        ...current.job,
        ...update,
        updatedAt: new Date().toISOString(),
      },
    });
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
