import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Clipboard,
  FileText,
  Headphones,
  LoaderCircle,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { createNoteJob, getNoteJob, getReadiness } from '@/api';
import type {
  NoteJob,
  SourcePlatform,
  SystemReadiness,
} from '@shared/api.interface';

const stageLabels = [
  ['downloading', '拉取音频', Headphones],
  ['transcribing', '语音转文字', FileText],
  ['summarizing', '生成学习笔记', Sparkles],
  ['publishing', '写入飞书', ArrowUpRight],
] as const;

const sourcePlatformLabels: Record<SourcePlatform, string> = {
  bilibili: 'B站',
  douyin: '抖音',
};

const sourcePlatformPlaceholders: Record<SourcePlatform, string> = {
  bilibili: 'https://www.bilibili.com/video/BV...',
  douyin: 'https://www.douyin.com/video/...',
};

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [sourcePlatform, setSourcePlatform] =
    useState<SourcePlatform>('bilibili');
  const [cookieBrowser, setCookieBrowser] = useState<
    '' | 'chrome' | 'safari' | 'edge' | 'firefox'
  >('');
  const [job, setJob] = useState<NoteJob | null>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const running = job && !['completed', 'failed'].includes(job.stage);

  useEffect(() => {
    getReadiness().then(setReadiness).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!job || !running) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await getNoteJob(job.id);
        setJob(next);
        if (next.stage === 'completed') toast.success('飞书学习笔记已经创建');
        if (next.stage === 'failed') toast.error(next.error || '处理失败');
      } catch {
        // A transient polling failure should not stop the task.
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [job?.id, running]);

  const readinessText = useMemo(() => {
    if (!readiness) return '正在检查本机环境…';
    const missing = [
      !readiness.ytDlp && 'yt-dlp',
      !readiness.ffmpeg && 'ffmpeg',
      !readiness.whisperCli && 'Whisper',
      !readiness.whisperModel && 'Whisper 模型',
      !readiness.larkCli && '飞书 CLI',
    ].filter(Boolean);
    return missing.length ? `缺少：${missing.join('、')}` : '本机处理环境已就绪';
  }, [readiness]);

  async function pasteUrl() {
    try {
      setUrl(await navigator.clipboard.readText());
    } catch {
      toast.error('浏览器未允许读取剪贴板，请手动粘贴');
    }
  }

  async function start() {
    if (!url.trim()) {
      toast.error('请先粘贴视频地址');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createNoteJob({
        url,
        sourcePlatform,
        cookieBrowser: cookieBrowser || undefined,
      });
      setJob(created);
    } catch (error: unknown) {
      const responseError = error as {
        response?: {
          data?: {
            error?: {
              message?: string;
            };
            message?: string;
          };
        };
      };
      const message =
        responseError.response?.data?.error?.message ||
        responseError.response?.data?.message ||
        '任务创建失败';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setJob(null);
    setUrl('');
    setSourcePlatform('bilibili');
  }

  return (
    <main className="min-h-screen overflow-auto bg-[#f7f7f5] text-[#161616]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-7 md:px-10 md:py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#fb7299] text-white shadow-sm">
              <WandSparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">视频学习笔记助手</p>
              <p className="text-xs text-black/45">从视频到飞书，一键完成</p>
            </div>
          </div>
          <div className={`status-pill ${readiness?.ready ? 'is-ready' : ''}`}>
            <span className="status-dot" />
            {readinessText}
          </div>
        </header>

        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.05fr_.95fr]">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-3 py-1.5 text-xs font-medium text-black/55 shadow-sm">
              <Sparkles className="size-3.5 text-[#fb7299]" />
              把收藏真正变成学会
            </div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.12] tracking-[-0.035em] md:text-6xl">
              粘贴一个视频链接，
              <br />
              收获一篇好笔记。
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-black/52 md:text-lg">
              支持 B站和抖音，自动提取音频、准确转录、整理重点，并写入你的飞书文档。
              你只需要负责检查和学习。
            </p>

            <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stageLabels.map(([stage, label, Icon], index) => {
                const stageIndex = stageLabels.findIndex(([item]) => item === job?.stage);
                const done =
                  job?.stage === 'completed' ||
                  (stageIndex >= 0 && index < stageIndex);
                const active = job?.stage === stage;
                return (
                  <div className={`stage-card ${active ? 'is-active' : ''}`} key={stage}>
                    <div className={`stage-icon ${done ? 'is-done' : ''}`}>
                      {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                    </div>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="task-panel">
            {!job ? (
              <>
                <div>
                  <p className="text-lg font-semibold tracking-tight">创建学习笔记</p>
                  <p className="mt-1 text-sm text-black/45">支持 B站和抖音视频地址</p>
                </div>

                <div className="mt-7 space-y-5">
                  <label className="block">
                    <span className="field-label">视频平台</span>
                    <select
                      className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-[#fafaf8] px-4 text-sm text-black/75 outline-none transition focus:border-[#fb7299]/50 focus:ring-4 focus:ring-[#fb7299]/10"
                      value={sourcePlatform}
                      onChange={(event) =>
                        setSourcePlatform(event.target.value as SourcePlatform)
                      }
                      disabled={submitting}
                    >
                      <option value="bilibili">B站</option>
                      <option value="douyin">抖音</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="field-label">
                      {sourcePlatformLabels[sourcePlatform]}视频地址
                    </span>
                    <div className="relative mt-2">
                      <Input
                        className="h-12 rounded-xl border-black/10 bg-[#fafaf8] pr-12 text-sm shadow-none focus-visible:ring-[#fb7299]/20"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder={sourcePlatformPlaceholders[sourcePlatform]}
                        disabled={submitting}
                      />
                      <button
                        aria-label="读取剪贴板"
                        className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg text-black/45 transition hover:bg-black/5 hover:text-black"
                        onClick={pasteUrl}
                        type="button"
                      >
                        <Clipboard className="size-4" />
                      </button>
                    </div>
                  </label>

                  <label className="block">
                    <span className="field-label">登录状态来源</span>
                    <select
                      className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-[#fafaf8] px-4 text-sm text-black/75 outline-none transition focus:border-[#fb7299]/50 focus:ring-4 focus:ring-[#fb7299]/10"
                      value={cookieBrowser}
                      onChange={(event) =>
                        setCookieBrowser(
                          event.target.value as
                            | ''
                            | 'chrome'
                            | 'safari'
                            | 'edge'
                            | 'firefox',
                        )
                      }
                      disabled={submitting}
                    >
                      <option value="">不使用登录状态</option>
                      <option value="chrome">Google Chrome</option>
                      <option value="safari">Safari</option>
                      <option value="edge">Microsoft Edge</option>
                      <option value="firefox">Firefox</option>
                    </select>
                    <span className="mt-2 block text-xs leading-5 text-black/38">
                      请选择已登录 {sourcePlatformLabels[sourcePlatform]} 的浏览器。登录信息由
                      yt-dlp 在本机读取，只用于向当前平台发起本次请求，不会保存到应用。
                    </span>
                  </label>

                  <Button
                    className="h-12 w-full rounded-xl bg-[#161616] text-sm font-medium text-white shadow-lg shadow-black/10 hover:bg-black/80"
                    onClick={start}
                    disabled={submitting || !readiness?.ready}
                  >
                    {submitting ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    ) : (
                      <WandSparkles className="mr-2 size-4" />
                    )}
                    开始生成学习笔记
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex min-h-[390px] flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold tracking-tight">
                        {job.stage === 'completed' ? '笔记已经准备好' : '正在处理视频'}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-black/45">
                        {job.videoTitle || '正在读取视频信息…'}
                      </p>
                      <p className="mt-1 text-xs text-black/35">
                        来源平台：{sourcePlatformLabels[job.sourcePlatform]}
                      </p>
                    </div>
                    {running && <LoaderCircle className="mt-1 size-5 animate-spin text-[#fb7299]" />}
                  </div>

                  <div className="mt-10">
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="font-medium">{job.message}</span>
                      <span className="tabular-nums text-black/38">{job.progress}%</span>
                    </div>
                    <Progress value={job.progress} className="h-2 bg-black/6 [&>div]:bg-[#fb7299]" />
                  </div>

                  {job.stage === 'failed' && (
                    <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
                      {job.error}
                    </div>
                  )}

                  {job.stage === 'completed' && (
                    <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-items-center rounded-full bg-emerald-600 text-white">
                          <Check className="size-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-emerald-950">飞书文档创建成功</p>
                          <p className="mt-0.5 text-xs text-emerald-800/60">现在可以打开检查学习笔记</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-9 space-y-3">
                  {job.documentUrl && (
                    <Button
                      className="h-12 w-full rounded-xl bg-[#3370ff] hover:bg-[#2864ea]"
                      onClick={() => window.open(job.documentUrl, '_blank', 'noopener,noreferrer')}
                    >
                      打开飞书学习笔记
                      <ArrowUpRight className="ml-2 size-4" />
                    </Button>
                  )}
                  {['completed', 'failed'].includes(job.stage) && (
                    <Button className="h-11 w-full rounded-xl" variant="outline" onClick={reset}>
                      再处理一个视频
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-black/6 py-5 text-xs text-black/35">
          <span>音频仅用于生成个人学习笔记</span>
          <span>本机处理 · 完成后自动清理临时文件</span>
        </footer>
      </div>
    </main>
  );
}
