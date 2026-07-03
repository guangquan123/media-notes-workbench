import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  ArrowUpRight,
  Check,
  Clipboard,
  Download,
  FileText,
  Link as LinkIcon,
  LoaderCircle,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  createArticleExportJob,
  getArticleExportJob,
  getArticleExportReadiness,
} from '@/api';
import { cn } from '@/lib/utils';
import type {
  ArticleArtifact,
  ArticleExportJob,
  ArticleExportReadiness,
  ArticleExportStage,
  ArticleExportStyle,
  ArticlePlatform,
} from '@shared/api.interface';

type PlatformOption = Exclude<ArticlePlatform, 'source'>;

const PLATFORM_OPTIONS: Array<{
  platform: PlatformOption;
  label: string;
  description: string;
}> = [
  {
    platform: 'wechat',
    label: '微信公众号',
    description: '优先 HTML 富文本，强调排版和可读性',
  },
  {
    platform: 'zhihu',
    label: '知乎',
    description: '偏保守的 Markdown 稿，兼顾可迁移性',
  },
  {
    platform: 'douyin',
    label: '抖音',
    description: '短内容口播稿，突出要点和封面提示',
  },
];

const STYLE_OPTIONS: Array<{
  value: ArticleExportStyle;
  label: string;
  description: string;
}> = [
  {
    value: 'editorial',
    label: '编辑稿',
    description: '更完整，适合直接复制到公众号草稿箱',
  },
  {
    value: 'concise',
    label: '简洁稿',
    description: '更短更轻，适合平台二次编辑',
  },
];

const PIPELINE_STEPS: Array<{
  stage: ArticleExportStage;
  label: string;
  icon: typeof LinkIcon;
}> = [
  { stage: 'checking', label: '检查环境', icon: LinkIcon },
  { stage: 'fetching', label: '抓取文档', icon: FileText },
  { stage: 'normalizing', label: '归一化结构', icon: Sparkles },
  { stage: 'rendering', label: '生成稿件', icon: WandSparkles },
];

const DEFAULT_PLATFORMS: PlatformOption[] = ['wechat', 'zhihu'];

export default function ArticleExportPage() {
  const [sourceDocUrl, setSourceDocUrl] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] =
    useState<PlatformOption[]>(DEFAULT_PLATFORMS);
  const [includeImages, setIncludeImages] = useState(true);
  const [preferredStyle, setPreferredStyle] =
    useState<ArticleExportStyle>('editorial');
  const [job, setJob] = useState<ArticleExportJob | null>(null);
  const [activePlatform, setActivePlatform] = useState<ArticlePlatform>('source');
  const [readiness, setReadiness] = useState<ArticleExportReadiness | null>(null);
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  const [startupDelayed, setStartupDelayed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const running = Boolean(job && !['completed', 'failed'].includes(job.stage));

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let failedAttempts = 0;

    const checkReadiness = async () => {
      try {
        const next = await getArticleExportReadiness();
        if (cancelled) return;
        setReadiness(next);
        setStartupDelayed(false);
      } catch {
        if (cancelled) return;
        failedAttempts += 1;
        setStartupDelayed(failedAttempts >= 10);
        retryTimer = window.setTimeout(checkReadiness, 1500);
      }
    };

    void checkReadiness();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [readinessAttempt]);

  useEffect(() => {
    if (!job || !running) return;
    let cancelled = false;
    let pollTimer: number | undefined;

    const pollJob = async () => {
      try {
        const next = await getArticleExportJob(job.id);
        if (cancelled) return;
        setJob(next);
        const nextAvailablePlatform =
          next.artifacts.find((artifact) => artifact.platform === activePlatform)
            ?.platform || next.artifacts[0]?.platform || 'source';
        setActivePlatform(nextAvailablePlatform);
        if (next.stage === 'completed') {
          toast.success('多平台稿件已经生成');
        }
        if (next.stage === 'failed') {
          toast.error(next.error || '处理失败');
        }
      } catch {
        // 轮询失败不影响当前任务
      } finally {
        if (!cancelled) {
          pollTimer = window.setTimeout(pollJob, 1800);
        }
      }
    };

    pollTimer = window.setTimeout(pollJob, 1800);
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [activePlatform, job, running]);

  useEffect(() => {
    if (!job?.artifacts.length) return;
    const fallbackPlatform =
      job.artifacts.find((artifact) => artifact.platform === 'wechat')?.platform ||
      job.artifacts[0]?.platform ||
      'source';
    setActivePlatform(fallbackPlatform);
  }, [job?.artifacts.length, job?.id]);

  const readinessText = useMemo(() => {
    if (!readiness) return '正在检查本机环境…';
    const missing = [
      !readiness.larkCli && 'lark-cli',
      !readiness.larkAuth && '飞书授权',
    ].filter(Boolean);
    return missing.length ? `缺少：${missing.join('、')}` : '飞书导出环境已就绪';
  }, [readiness]);

  const artifactMap = useMemo(() => {
    const map = new Map<ArticlePlatform, ArticleArtifact>();
    job?.artifacts.forEach((artifact) => {
      map.set(artifact.platform, artifact);
    });
    return map;
  }, [job?.artifacts]);

  const visibleArtifactOrder: ArticlePlatform[] = useMemo(() => {
    const platformOrder: ArticlePlatform[] = ['source', ...selectedPlatforms];
    if (job?.artifacts.length) {
      return job.artifacts.map((artifact) => artifact.platform);
    }
    return platformOrder;
  }, [job?.artifacts, selectedPlatforms]);

  const activeArtifact =
    artifactMap.get(activePlatform) || artifactMap.get('source') || null;

  async function pasteUrl() {
    try {
      setSourceDocUrl(await navigator.clipboard.readText());
    } catch {
      toast.error('浏览器未允许读取剪贴板，请手动粘贴');
    }
  }

  async function start() {
    if (!sourceDocUrl.trim()) {
      toast.error('请先粘贴飞书文档地址');
      return;
    }
    if (!selectedPlatforms.length) {
      toast.error('请至少选择一个目标平台');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createArticleExportJob({
        sourceDocUrl,
        targetPlatforms: selectedPlatforms,
        includeImages,
        preferredStyle,
      });
      setJob(created);
      setActivePlatform('source');
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

  async function copyArtifact(artifact: ArticleArtifact | null) {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.copyContent);
      toast.success('稿件内容已复制');
    } catch {
      toast.error('复制失败，请手动复制');
    }
  }

  function downloadArtifact(artifact: ArticleArtifact | null) {
    if (!artifact) return;
    const blob = new Blob([artifact.copyContent], {
      type: getMimeType(artifact.format),
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artifact.downloadFileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast.success('下载已开始');
  }

  function resetForm() {
    setJob(null);
    setActivePlatform('source');
    setSourceDocUrl('');
    setSelectedPlatforms(DEFAULT_PLATFORMS);
    setIncludeImages(true);
    setPreferredStyle('editorial');
  }

  if (!readiness) {
    return (
      <main className="grid min-h-screen place-items-center overflow-hidden bg-[#f5f1ea] px-6 text-[#1c1b18]">
        <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-black/8 bg-white/95 px-8 py-12 text-center shadow-[0_30px_90px_rgba(64,52,32,0.12)]">
          <div className="absolute -right-16 -top-20 size-48 rounded-full bg-[#f59e0b]/12 blur-3xl" />
          <div className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-[#d97706] text-white shadow-lg shadow-[#d97706]/20">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
          <h1 className="relative mt-6 text-2xl font-semibold tracking-tight">
            正在启动文章导出工具
          </h1>
          <p className="relative mt-3 text-sm leading-6 text-black/52">
            正在检查飞书 CLI 与登录态，准备好后会自动进入。
          </p>
          {startupDelayed && (
            <div className="relative mt-7 rounded-2xl bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
              启动时间比平时稍长，请保持终端开启。
              <button
                className="ml-1 font-semibold underline underline-offset-4"
                onClick={() => {
                  setStartupDelayed(false);
                  setReadinessAttempt((value) => value + 1);
                }}
                type="button"
              >
                立即重试
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-auto bg-[#f5f1ea] text-[#1c1b18]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 md:px-10 md:py-8">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#d97706] text-white shadow-sm">
              <WandSparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">飞书文章多平台导出</p>
              <p className="text-xs text-black/45">
                公众号优先，知乎其次，抖音输出轻量稿
              </p>
            </div>
          </div>
          <div className={`status-pill ${readiness.ready ? 'is-ready' : ''}`}>
            <span className="status-dot" />
            {readinessText}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-black/68 shadow-sm transition hover:border-black/15 hover:text-black"
              to="/video-notes"
            >
              <ArrowUpRight className="size-4" />
              视频学习笔记
            </Link>
          </div>
        </header>

        <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-6">
            <Card className="overflow-hidden border-black/8 bg-white/90 shadow-[0_20px_60px_rgba(57,46,29,0.08)]">
              <CardHeader className="space-y-3 border-b border-black/6 bg-gradient-to-br from-[#fffaf0] to-white">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d97706]/20 bg-[#fef3c7] px-3 py-1 text-xs font-semibold text-[#9a3412]">
                  <Sparkles className="size-3.5" />
                  一次生成多个平台稿件
                </div>
                <CardTitle className="text-3xl tracking-[-0.04em]">
                  飞书文档，一键变成平台可发布稿件
                </CardTitle>
                <CardDescription className="max-w-xl text-sm leading-6 text-black/55">
                  先把飞书当唯一写作源，系统负责抓取文档、归一化内容，再生成微信公众号、知乎和抖音的
                  适配稿，最后由你手动发布。
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-black/74">
                    飞书文档地址
                  </label>
                  <div className="flex gap-2">
                    <Input
                      className="h-11 bg-white"
                      placeholder="粘贴飞书文档 URL 或 token"
                      value={sourceDocUrl}
                      onChange={(event) => setSourceDocUrl(event.target.value)}
                    />
                    <Button onClick={pasteUrl} type="button" variant="outline">
                      粘贴
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-black/46">
                    建议文档里已有标题、分节、列表和图片，输出质量会更稳定。
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-black/74">
                      目标平台
                    </label>
                    <Button
                      onClick={() => setSelectedPlatforms(DEFAULT_PLATFORMS)}
                      type="button"
                      variant="ghost"
                      size="sm"
                    >
                      恢复默认
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {PLATFORM_OPTIONS.map((item) => {
                      const selected = selectedPlatforms.includes(item.platform);
                      return (
                        <button
                          key={item.platform}
                          className={cn(
                            'rounded-2xl border p-4 text-left transition',
                            selected
                              ? 'border-[#d97706]/30 bg-[#fef7e8] shadow-sm'
                              : 'border-black/8 bg-white hover:border-black/15',
                          )}
                          onClick={() => togglePlatform(item.platform, setSelectedPlatforms)}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-black/82">
                                {item.label}
                              </div>
                              <div className="mt-1 text-xs leading-5 text-black/46">
                                {item.description}
                              </div>
                            </div>
                            <div
                              className={cn(
                                'grid size-6 place-items-center rounded-full border',
                                selected
                                  ? 'border-[#d97706] bg-[#d97706] text-white'
                                  : 'border-black/12 text-transparent',
                              )}
                            >
                              <Check className="size-3.5" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-black/8 bg-[#fcfcfb] p-4">
                    <div className="mb-3 text-sm font-medium text-black/74">图片处理</div>
                    <button
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                        includeImages
                          ? 'border-[#d97706]/30 bg-[#fef7e8]'
                          : 'border-black/8 bg-white',
                      )}
                      onClick={() => setIncludeImages((value) => !value)}
                      type="button"
                    >
                      <div>
                        <div className="font-medium">
                          {includeImages ? '保留图片' : '忽略图片'}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-black/46">
                          {includeImages
                            ? '适合公众号和知乎完整排版。'
                            : '适合快速出稿与纯文字审阅。'}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'grid size-5 place-items-center rounded-full border',
                          includeImages
                            ? 'border-[#d97706] bg-[#d97706] text-white'
                            : 'border-black/12 text-transparent',
                        )}
                      >
                        <Check className="size-3" />
                      </div>
                    </button>
                  </div>

                  <div className="rounded-2xl border border-black/8 bg-[#fcfcfb] p-4">
                    <div className="mb-3 text-sm font-medium text-black/74">稿件风格</div>
                    <div className="space-y-2">
                      {STYLE_OPTIONS.map((option) => {
                        const selected = preferredStyle === option.value;
                        return (
                          <button
                            key={option.value}
                            className={cn(
                              'w-full rounded-xl border px-4 py-3 text-left transition',
                              selected
                                ? 'border-[#d97706]/30 bg-[#fef7e8]'
                                : 'border-black/8 bg-white hover:border-black/15',
                            )}
                            onClick={() => setPreferredStyle(option.value)}
                            type="button"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium">{option.label}</div>
                                <div className="mt-1 text-xs leading-5 text-black/46">
                                  {option.description}
                                </div>
                              </div>
                              <div
                                className={cn(
                                  'grid size-5 place-items-center rounded-full border',
                                  selected
                                    ? 'border-[#d97706] bg-[#d97706] text-white'
                                    : 'border-black/12 text-transparent',
                                )}
                              >
                                <Check className="size-3" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={start} disabled={submitting} type="button" size="lg">
                    {submitting ? '生成中…' : '生成多平台稿件'}
                  </Button>
                  <Button onClick={resetForm} type="button" variant="outline" size="lg">
                    重置
                  </Button>
                  <div className="text-xs text-black/45">
                    公众号优先，知乎次之，抖音会自动压缩成短稿。
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {PIPELINE_STEPS.map((step, index) => {
                    const stageIndex = PIPELINE_STEPS.findIndex(
                      (item) => item.stage === job?.stage,
                    );
                    const done =
                      job?.stage === 'completed' ||
                      (stageIndex >= 0 && index < stageIndex);
                    const active = job?.stage === step.stage;
                    const Icon = step.icon;
                    return (
                      <div
                        className={cn(
                          'rounded-2xl border p-3',
                          active
                            ? 'border-[#d97706]/30 bg-[#fef7e8]'
                            : 'border-black/8 bg-white',
                        )}
                        key={step.stage}
                      >
                        <div
                          className={cn(
                            'mb-2 grid size-8 place-items-center rounded-xl',
                            done
                              ? 'bg-emerald-100 text-emerald-700'
                              : active
                                ? 'bg-[#d97706] text-white'
                                : 'bg-black/5 text-black/55',
                          )}
                        >
                          {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                        </div>
                        <div className="text-sm font-medium">{step.label}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-black/8 bg-white/90 shadow-[0_20px_60px_rgba(57,46,29,0.08)]">
              <CardHeader>
                <CardTitle className="text-xl tracking-tight">任务状态</CardTitle>
                <CardDescription>
                  当前任务的进度、提示和错误信息都会先出现在这里。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {job ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{job.stage}</Badge>
                      <Badge variant="secondary">{Math.round(job.progress)}%</Badge>
                      <span className="text-sm text-black/52">{job.message}</span>
                    </div>
                    <Progress value={job.progress} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-black/8 bg-[#fcfcfb] p-4">
                        <div className="text-xs uppercase tracking-[0.22em] text-black/38">
                          源文档
                        </div>
                        <div className="mt-2 break-all text-sm leading-6 text-black/78">
                          {job.sourceDocUrl}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-black/8 bg-[#fcfcfb] p-4">
                        <div className="text-xs uppercase tracking-[0.22em] text-black/38">
                          生成结果
                        </div>
                        <div className="mt-2 text-sm leading-6 text-black/78">
                          {job.sourceTitle || '标题待提取'}
                        </div>
                      </div>
                    </div>
                    {job.error ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
                        {job.error}
                      </div>
                    ) : null}
                    {job.stage === 'completed' ? (
                      <Button onClick={() => setActivePlatform('source')} type="button" variant="outline">
                        查看结果
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/12 bg-[#fcfcfb] p-5 text-sm leading-6 text-black/50">
                    填写文档地址并点击“生成多平台稿件”后，这里会显示实时状态。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="sticky top-6 overflow-hidden border-black/8 bg-white/90 shadow-[0_20px_60px_rgba(57,46,29,0.08)]">
              <CardHeader className="border-b border-black/6 bg-[#fffefb]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl tracking-tight">预览面板</CardTitle>
                    <CardDescription>
                      点击平台切换预览，复制和下载按钮会使用当前稿件。
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => copyArtifact(activeArtifact)}
                      disabled={!activeArtifact}
                      type="button"
                      variant="outline"
                      size="sm"
                    >
                      <Clipboard className="size-4" />
                      复制
                    </Button>
                    <Button
                      onClick={() => downloadArtifact(activeArtifact)}
                      disabled={!activeArtifact}
                      type="button"
                      size="sm"
                    >
                      <Download className="size-4" />
                      下载
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs
                  className="gap-0"
                  value={activePlatform}
                  onValueChange={(value) => setActivePlatform(value as ArticlePlatform)}
                >
                  <div className="border-b border-black/6 px-5 py-4">
                    <TabsList className="h-auto w-full flex-wrap bg-transparent p-0">
                      {visibleArtifactOrder.map((platform) => {
                        const artifact = artifactMap.get(platform);
                        if (!artifact) return null;
                        return (
                          <TabsTrigger
                            key={platform}
                            className="flex-none rounded-full border border-black/8 px-4 py-2 text-sm shadow-none data-[state=active]:border-[#d97706]/30 data-[state=active]:bg-[#fef7e8] data-[state=active]:text-black"
                            value={platform}
                          >
                            {getPlatformLabel(platform)}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </div>

                  {visibleArtifactOrder.map((platform) => {
                    const artifact = artifactMap.get(platform);
                    if (!artifact) return null;
                    return (
                      <TabsContent className="m-0" key={platform} value={platform}>
                        <div className="space-y-4 p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{getPlatformLabel(platform)}</Badge>
                            <Badge variant="secondary">{artifact.format}</Badge>
                            <span className="text-xs text-black/44">
                              {artifact.downloadFileName}
                            </span>
                          </div>

                          <div className="rounded-3xl border border-black/8 bg-[#fbfaf7] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-black/72">
                                预览
                              </div>
                              <div className="text-xs text-black/38">
                                {artifact.platform === 'wechat'
                                  ? '公众号富文本'
                                  : artifact.platform === 'zhihu'
                                    ? 'Markdown 预览'
                                    : '短稿文本'}
                              </div>
                            </div>
                            <div className="max-h-[52vh] overflow-auto rounded-2xl border border-black/8 bg-white p-5">
                              {artifact.previewHtml ? (
                                <div
                                  className="article-preview prose prose-slate max-w-none text-[15px] leading-8"
                                  dangerouslySetInnerHTML={{
                                    __html: artifact.previewHtml,
                                  }}
                                />
                              ) : (
                                <pre className="whitespace-pre-wrap text-sm leading-7 text-black/78">
                                  {artifact.copyContent}
                                </pre>
                              )}
                            </div>
                          </div>

                          {artifact.unsupportedBlocks.length ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                              <div className="mb-2 text-sm font-medium text-amber-900">
                                需要人工确认的内容
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {artifact.unsupportedBlocks.map((item) => (
                                  <Badge key={item} variant="outline">
                                    {item}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {job?.artifacts.length ? (
                <Card className="border-black/8 bg-white/90 shadow-[0_20px_60px_rgba(57,46,29,0.08)]">
                  <CardHeader>
                    <CardTitle className="text-xl tracking-tight">输出结果卡片</CardTitle>
                    <CardDescription>
                      每个平台都有独立稿件，适合逐个平台检查、复制和下载。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    {job.artifacts.map((artifact) => (
                      <div
                        key={artifact.platform}
                        className={cn(
                          'rounded-2xl border p-4 transition',
                          activePlatform === artifact.platform
                            ? 'border-[#d97706]/30 bg-[#fef7e8]'
                            : 'border-black/8 bg-[#fcfcfb]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-black/82">
                              {getPlatformLabel(artifact.platform)}
                            </div>
                            <div className="mt-1 text-xs text-black/44">
                              {artifact.downloadFileName}
                            </div>
                          </div>
                          <Badge variant="secondary">{artifact.format}</Badge>
                        </div>
                        <div className="mt-3 line-clamp-3 text-sm leading-6 text-black/60">
                          {summarizeArtifact(artifact)}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            onClick={() => setActivePlatform(artifact.platform)}
                            type="button"
                            variant="outline"
                            size="sm"
                          >
                            预览
                          </Button>
                          <Button
                            onClick={() => copyArtifact(artifact)}
                            type="button"
                            variant="outline"
                            size="sm"
                          >
                            复制
                          </Button>
                          <Button
                            onClick={() => downloadArtifact(artifact)}
                            type="button"
                            size="sm"
                          >
                            下载
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function togglePlatform(
  platform: PlatformOption,
  setSelectedPlatforms: Dispatch<SetStateAction<PlatformOption[]>>,
): void {
  setSelectedPlatforms((current) => {
    if (current.includes(platform)) {
      const next = current.filter((item) => item !== platform);
      return next.length ? next : current;
    }
    return [...current, platform];
  });
}

function getPlatformLabel(platform: ArticlePlatform): string {
  if (platform === 'source') return '原文';
  if (platform === 'wechat') return '微信公众号';
  if (platform === 'zhihu') return '知乎';
  return '抖音';
}

function getMimeType(format: ArticleArtifact['format']): string {
  if (format === 'html') return 'text/html;charset=utf-8';
  if (format === 'markdown') return 'text/markdown;charset=utf-8';
  return 'text/plain;charset=utf-8';
}

function summarizeArtifact(artifact: ArticleArtifact): string {
  const sourceText =
    artifact.platform === 'wechat'
      ? artifact.copyContent
          .replace(/<style[\s\S]*?<\/style>/giu, ' ')
          .replace(/<[^>]+>/gu, ' ')
      : artifact.copyContent;
  const lines = sourceText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .slice(0, 4)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .slice(0, 180);
}
