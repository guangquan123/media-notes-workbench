import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CreateNoteJobRequest,
  JobStage,
  NoteJob,
  SourcePlatform,
  SystemReadiness,
} from '@shared/api.interface';

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
  private readonly jobs = new Map<string, NoteJob>();
  private readonly whisperModelPath = join(
    process.cwd(),
    'models',
    'ggml-base-q5_1.bin',
  );

  constructor(
    @Inject() private readonly capabilityService: CapabilityService,
  ) {}

  async getReadiness(): Promise<SystemReadiness> {
    const [ytDlp, ffmpeg, whisperCli, whisperModel, larkCli] = await Promise.all([
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
      ready: ytDlp && ffmpeg && whisperCli && whisperModel && larkCli,
    };
  }

  create(input: CreateNoteJobRequest): NoteJob {
    const sourcePlatform = this.resolveSourcePlatform(input.sourcePlatform);
    const url = this.validateSourceUrl(input.url, sourcePlatform);
    const cookieBrowser = this.validateCookieBrowser(input.cookieBrowser);

    const now = new Date().toISOString();
    const job: NoteJob = {
      id: randomUUID(),
      stage: 'queued',
      progress: 2,
      message: '任务已创建，正在准备…',
      sourcePlatform,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    void this.run(job.id, url, sourcePlatform, cookieBrowser);
    return job;
  }

  get(id: string): NoteJob {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('任务不存在或服务已重启');
    return job;
  }

  private async run(
    id: string,
    url: string,
    sourcePlatform: SourcePlatform,
    cookieBrowser?: CreateNoteJobRequest['cookieBrowser'],
  ) {
    const workDir = await mkdtemp(join(tmpdir(), 'video-note-'));
    try {
      this.update(id, 'checking', 6, '正在检查本机依赖…');
      const readiness = await this.getReadiness();
      if (!readiness.ytDlp) throw new Error('未找到 yt-dlp，请先安装 yt-dlp');
      if (!readiness.ffmpeg) throw new Error('未找到 ffmpeg，请先安装 ffmpeg');
      if (!readiness.whisperCli) throw new Error('未找到 whisper-cli，请先安装 whisper-cpp');
      if (!readiness.whisperModel) throw new Error('未找到本机 Whisper 模型');
      if (!readiness.larkCli) throw new Error('未找到 lark-cli，请先安装并登录飞书');

      this.update(id, 'downloading', 14, '正在解析视频并提取音频…');
      const sourceArgs =
        sourcePlatform === 'bilibili'
          ? await this.buildSourceArgs(sourcePlatform, cookieBrowser)
          : [];
      const metadata =
        sourcePlatform === 'douyin'
          ? await this.getDouyinMetadata(url)
          : await this.getYtDlpMetadata(url, sourceArgs);
      const videoTitle = metadata.title || `${this.getSourceLabel(sourcePlatform)}学习笔记`;
      this.patch(id, { videoTitle });

      const audioPath = join(workDir, 'audio.mp3');
      if (sourcePlatform === 'douyin' && metadata.mediaUrl) {
        await this.extractDouyinAudio(metadata.mediaUrl, audioPath);
      } else {
        const audioTemplate = join(workDir, 'audio.%(ext)s');
        await this.runCommand('yt-dlp', [
          ...sourceArgs,
          '--no-playlist',
          '--extract-audio',
          '--audio-format',
          'mp3',
          '--audio-quality',
          '5',
          '--output',
          audioTemplate,
          url,
        ]);
      }
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

      this.update(id, 'summarizing', 69, '转录完成，正在整理学习笔记…');
      const markdown = await this.summarize({
        transcript,
        title: videoTitle,
        uploader: metadata.uploader || '未知',
        duration: metadata.duration_string || '未知',
        sourceUrl: metadata.webpage_url || url,
        sourcePlatform,
        generatedDate: new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()),
      });

      this.update(id, 'publishing', 88, '笔记已生成，正在写入飞书文档…');
      const documentUrl = await this.createLarkDocument(videoTitle, markdown);
      this.patch(id, {
        stage: 'completed',
        progress: 100,
        message: '完成！飞书学习笔记已创建。',
        sourcePlatform,
        documentUrl,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '未知错误';
      const message = this.friendlyDownloadError(
        rawMessage,
        sourcePlatform,
        cookieBrowser,
      );
      this.logger.error(`任务 ${id} 失败: ${message}`);
      this.patch(id, {
        stage: 'failed',
        message: '处理失败',
        error: message,
      });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
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
        | {
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
        }
        | null
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
    await this.runCommand('ffmpeg', [
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
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '5',
      '-y',
      audioPath,
    ]);
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

  private async splitAudioIfNeeded(audioPath: string, workDir: string): Promise<string[]> {
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
    title: string;
    uploader: string;
    duration: string;
    sourceUrl: string;
    sourcePlatform: SourcePlatform;
    generatedDate: string;
  }): Promise<string> {
    const pluginInstanceId = 'bilibili-note-writer';
    const actionKey = 'textGenerate';
    const pluginInput = {
      source_platform: this.getSourceLabel(input.sourcePlatform),
      source_text: input.transcript,
      video_title: input.title,
      uploader: input.uploader,
      duration: input.duration,
      source_url: input.sourceUrl,
      generated_date: input.generatedDate,
    };
    try {
      const result = (await this.capabilityService
        .load(pluginInstanceId)
        .call(actionKey, pluginInput)) as {
        content?: string;
        response?: string;
      };
      const markdown = result?.content || result?.response || '';
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

  private async createLarkDocument(title: string, markdown: string): Promise<string> {
    const safeTitle = `学习笔记｜${title}`.slice(0, 120);
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
      throw new Error(parsed.error?.hint || parsed.error?.message || '飞书文档创建失败');
    }
    return parsed.data.document.url;
  }

  private resolveSourcePlatform(value?: string): SourcePlatform {
    if (!value || value === 'bilibili') return 'bilibili';
    if (value === 'douyin') return 'douyin';
    throw new BadRequestException('不支持的视频平台');
  }

  private getSourceLabel(platform: SourcePlatform): string {
    return SOURCE_PROFILES[platform].label;
  }

  private validateSourceUrl(raw: string, platform: SourcePlatform): string {
    try {
      const urlMatch = raw.match(/https?:\/\/[^\s]+/u);
      if (!urlMatch) {
        throw new Error(SOURCE_PROFILES[platform].urlErrorMessage);
      }
      const url = new URL(urlMatch[0]);
      const hostname = url.hostname.toLowerCase();
      const profile = SOURCE_PROFILES[platform];
      const allowed = profile.urlHosts.some(
        (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
      );
      if (!allowed || !['http:', 'https:'].includes(url.protocol)) {
        throw new Error(profile.urlErrorMessage);
      }
      return platform === 'douyin'
        ? this.normalizeDouyinUrl(url)
        : url.toString();
    } catch (error) {
      const profile = SOURCE_PROFILES[platform];
      if (error instanceof Error && error.message) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException(profile.urlErrorMessage);
    }
  }

  private normalizeDouyinUrl(url: URL): string {
    if (url.pathname === '/jingxuan') {
      const videoId = url.searchParams.get('modal_id');
      if (!videoId || !/^\d+$/u.test(videoId)) {
        throw new Error('抖音精选链接缺少有效的 modal_id');
      }
      return `https://www.douyin.com/video/${videoId}`;
    }
    return url.toString();
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

  private update(id: string, stage: JobStage, progress: number, message: string) {
    this.patch(id, { stage, progress, message });
  }

  private patch(id: string, update: Partial<NoteJob>) {
    const current = this.jobs.get(id);
    if (!current) return;
    this.jobs.set(id, {
      ...current,
      ...update,
      updatedAt: new Date().toISOString(),
    });
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

  private runCommand(command: string, args: string[], stdin?: string): Promise<CommandResult> {
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
        else reject(new Error(this.commandError(command, stderr, stdout, code)));
      });
      if (stdin) child.stdin.end(stdin);
      else child.stdin.end();
    });
  }

  private commandError(command: string, stderr: string, stdout: string, code: number | null) {
    const raw = (stderr || stdout).trim();
    try {
      const parsed = JSON.parse(raw) as { error?: { hint?: string; message?: string } };
      return parsed.error?.hint || parsed.error?.message || `${command} 执行失败`;
    } catch {
      return raw.split('\n').slice(-5).join('\n') || `${command} 执行失败（${code}）`;
    }
  }

}
