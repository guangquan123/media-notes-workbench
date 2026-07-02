import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CreateNoteJobRequest,
  JobStage,
  NoteJob,
  SystemReadiness,
} from '@shared/api.interface';

type CommandResult = { stdout: string; stderr: string };

@Injectable()
export class NoteJobsService {
  private readonly logger = new Logger(NoteJobsService.name);
  private readonly jobs = new Map<string, NoteJob>();

  async getReadiness(): Promise<SystemReadiness> {
    const [ytDlp, ffmpeg, larkCli] = await Promise.all([
      this.commandExists('yt-dlp'),
      this.commandExists('ffmpeg'),
      this.commandExists('lark-cli'),
    ]);
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
    return {
      ytDlp,
      ffmpeg,
      larkCli,
      openAiConfigured,
      ready: ytDlp && ffmpeg && larkCli,
    };
  }

  create(input: CreateNoteJobRequest): NoteJob {
    const url = this.validateBilibiliUrl(input.url);
    const apiKey = input.apiKey?.trim() || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('请填写 OpenAI API Key，或在环境变量中配置 OPENAI_API_KEY');
    }

    const now = new Date().toISOString();
    const job: NoteJob = {
      id: randomUUID(),
      stage: 'queued',
      progress: 2,
      message: '任务已创建，正在准备…',
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    void this.run(job.id, url, apiKey);
    return job;
  }

  get(id: string): NoteJob {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('任务不存在或服务已重启');
    return job;
  }

  private async run(id: string, url: string, apiKey: string) {
    const workDir = await mkdtemp(join(tmpdir(), 'bilibili-note-'));
    try {
      this.update(id, 'checking', 6, '正在检查本机依赖…');
      const readiness = await this.getReadiness();
      if (!readiness.ytDlp) throw new Error('未找到 yt-dlp，请先安装 yt-dlp');
      if (!readiness.ffmpeg) throw new Error('未找到 ffmpeg，请先安装 ffmpeg');
      if (!readiness.larkCli) throw new Error('未找到 lark-cli，请先安装并登录飞书');

      this.update(id, 'downloading', 14, '正在解析视频并提取音频…');
      const metadataResult = await this.runCommand('yt-dlp', [
        '--no-playlist',
        '--dump-single-json',
        '--skip-download',
        url,
      ]);
      const metadata = JSON.parse(metadataResult.stdout) as {
        title?: string;
        uploader?: string;
        webpage_url?: string;
        duration_string?: string;
      };
      const videoTitle = metadata.title || 'B站学习笔记';
      this.patch(id, { videoTitle });

      const audioTemplate = join(workDir, 'audio.%(ext)s');
      await this.runCommand('yt-dlp', [
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
      const audioPath = join(workDir, 'audio.mp3');
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
        transcripts.push(await this.transcribe(audioParts[index], apiKey));
      }
      const transcript = transcripts.join('\n\n');
      if (!transcript.trim()) throw new Error('转录结果为空');

      this.update(id, 'summarizing', 69, '转录完成，正在整理学习笔记…');
      const markdown = await this.summarize({
        apiKey,
        transcript,
        title: videoTitle,
        uploader: metadata.uploader || '未知',
        duration: metadata.duration_string || '未知',
        sourceUrl: metadata.webpage_url || url,
      });

      this.update(id, 'publishing', 88, '笔记已生成，正在写入飞书文档…');
      const documentUrl = await this.createLarkDocument(videoTitle, markdown);
      this.patch(id, {
        stage: 'completed',
        progress: 100,
        message: '完成！飞书学习笔记已创建。',
        documentUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
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

  private async transcribe(audioPath: string, apiKey: string): Promise<string> {
    const bytes = await readFile(audioPath);
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('language', 'zh');
    form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), basename(audioPath));
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`OpenAI 转录失败：${await this.readApiError(response)}`);
    }
    const data = (await response.json()) as { text?: string };
    return data.text || '';
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
    apiKey: string;
    transcript: string;
    title: string;
    uploader: string;
    duration: string;
    sourceUrl: string;
  }): Promise<string> {
    const prompt = `你是一位严谨的中文学习笔记编辑。请把下面的 B站视频转录稿整理成高质量 Markdown 学习笔记。

要求：
1. 忠于转录稿，不编造事实；不确定的内容明确标记“待核对”。
2. 结构自然，至少包含：一句话总结、核心知识点、分章节笔记、案例或示例、易错点、行动清单、复习问题。
3. 去掉口头禅和重复表达，但保留关键推理、数字、术语和结论。
4. 直接输出 Markdown 正文，不要使用 Markdown 代码围栏。
5. 文首保留以下来源信息：
   - 视频：${input.title}
   - UP主：${input.uploader}
   - 时长：${input.duration}
   - 原链接：${input.sourceUrl}

转录稿：
${input.transcript}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_SUMMARY_MODEL || 'gpt-5-mini',
        input: prompt,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI 总结失败：${await this.readApiError(response)}`);
    }
    const data = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const fallbackText = data.output
      ?.flatMap((item) => item.content || [])
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text || '')
      .join('\n');
    const markdown = data.output_text || fallbackText || '';
    if (!markdown.trim()) throw new Error('大模型没有返回学习笔记');
    return markdown;
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

  private validateBilibiliUrl(raw: string): string {
    try {
      const url = new URL(raw.trim());
      const hostname = url.hostname.toLowerCase();
      const allowed =
        hostname === 'bilibili.com' ||
        hostname.endsWith('.bilibili.com') ||
        hostname === 'b23.tv' ||
        hostname.endsWith('.b23.tv');
      if (!allowed || !['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.toString();
    } catch {
      throw new BadRequestException('请输入有效的 B站视频地址');
    }
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

  private async readApiError(response: Response): Promise<string> {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      return parsed.error?.message || `HTTP ${response.status}`;
    } catch {
      return text.slice(0, 300) || `HTTP ${response.status}`;
    }
  }
}
