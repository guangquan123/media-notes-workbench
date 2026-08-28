import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpenText,
  CheckCircle2,
  ClipboardCheck,
  Clapperboard,
  CloudCog,
  FileOutput,
  FileText,
  History,
  ImageIcon,
  Link2,
  ListChecks,
  MonitorUp,
  Settings2,
  ShieldCheck,
  Sparkles,
  Video,
  Waypoints,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ManualStep {
  description: string;
  icon: LucideIcon;
  title: string;
}

interface SourceGuide {
  description: string;
  icon: LucideIcon;
  limit: string;
  path: string;
  steps: string[];
  title: string;
}

interface FaqItem {
  answer: string;
  question: string;
}

const WORKFLOW_STEPS: ManualStep[] = [
  {
    title: '完成首次配置',
    description: '检查环境，配置模型服务提供者、能力模型和转录方式。',
    icon: Settings2,
  },
  {
    title: '选择素材入口',
    description: '按平台视频、本地视频、录音、双源资料或文档选择入口。',
    icon: Waypoints,
  },
  {
    title: '设置生成方式',
    description: '选择学习笔记或会议纪要，必要时开启关键画面。',
    icon: Sparkles,
  },
  {
    title: '跟踪并核对结果',
    description: '查看实时阶段、回看原文，在转化记录中继续处理和追溯。',
    icon: ClipboardCheck,
  },
];

const SOURCE_GUIDES: SourceGuide[] = [
  {
    title: '平台视频学习笔记',
    description: '处理哔哩哔哩或抖音链接，自动拉取、转写并整理为笔记。',
    icon: Link2,
    limit: '仅处理你有权使用的平台内容；部分受限视频需要本机浏览器登录态。',
    path: '/video-notes',
    steps: [
      '选择“B站”或“抖音”，粘贴完整视频链接。',
      '默认不读取登录状态；仅在页面提示受限时，选择已登录的本机浏览器。',
      '选择笔记风格和是否保留关键画面，随后开始生成。',
    ],
  },
  {
    title: '本地视频',
    description: '适合课程、讲座、录屏等单路视频，系统会提取音轨并转写。',
    icon: Video,
    limit: '最多 10 个视频，单个及累计不超过 10 GB。',
    path: '/local-video-notes',
    steps: [
      '拖入或选择本地视频文件。',
      '选择学习笔记或会议纪要；按需开启关键画面。',
      '开始任务，等待上传、音轨整理、转写、总结和保存完成。',
    ],
  },
  {
    title: '录音笔记',
    description: '将课堂录音、访谈或语音备忘整理为重点、决策和行动项。',
    icon: AudioLines,
    limit: '支持 MP3、M4A、WAV、AAC、FLAC、OGG，单个文件最大 10 GB。',
    path: '/audio-notes',
    steps: [
      '上传录音文件。',
      '选择学习笔记或会议纪要。',
      '开始生成，并在完成后从结果或转化记录打开笔记。',
    ],
  },
  {
    title: '双源会议 / 培训笔记',
    description: '用主视频提供画面、辅助录音补足语义，交叉验证同一场内容。',
    icon: Clapperboard,
    limit: '必须同时上传主视频和辅助录音，两个文件累计不超过 10 GB。',
    path: '/paired-media-notes',
    steps: [
      '分别上传主视频和辅助录音。',
      '优先使用自动对齐；只有已知两路起点偏差时才改为手动偏移。',
      '选择会议纪要或学习笔记，按需开启关键画面后开始交叉验证。',
    ],
  },
  {
    title: '文档笔记',
    description: '把书籍、报告、课件等多份资料解析并融合为可回顾的知识资产。',
    icon: FileText,
    limit:
      '支持 PDF、Word、PowerPoint、TXT、Markdown；最多 10 个，累计不超过 200 MB。',
    path: '/document-notes',
    steps: [
      '选择一个或多份文档并上传。',
      '选择学习笔记或会议纪要。',
      '开始生成；完成后可在转化记录查看解析质量和原文入口。',
    ],
  },
];

const FAQS: FaqItem[] = [
  {
    question: '为什么页面提示“需要配置”或无法开始任务？',
    answer:
      '先进入“参数配置 → 开始使用”重新检测。笔记输出位置、总结模型是基础条件；平台链接、转录方式等能力会按当前素材类型显示是否需要补齐。',
  },
  {
    question: '为什么平台视频拉取失败？',
    answer:
      '先确认链接完整、平台选择正确。若提示登录态或 Cookie 问题，请在普通浏览器中重新登录对应平台，再只为本次任务选择该浏览器；登录信息不会保存到应用。',
  },
  {
    question: '为什么没有创建待办？',
    answer:
      '文档和待办只会发送到当前启用的一个连接器。待办是否创建还取决于该连接器的授权和可选执行人配置；请在记录中查看任务同步状态和错误信息。',
  },
  {
    question: '修改提示词后，为什么新笔记没有变化？',
    answer:
      '保存只更新草稿，只有点击“发布”后的版本才会用于后续任务。已完成的历史笔记不会因发布新版本而自动改写。',
  },
  {
    question: '能否删除原始文件？',
    answer:
      '可以在符合条件的记录中从“更多”操作删除已保留的源文件。删除后将不能再依赖这些源文件做完整重处理，请先确认已有笔记和原文已妥善归档。',
  },
];

const OperationManualPage = () => {
  return (
    <main className="min-h-screen bg-[#f7f7f5] px-4 py-6 text-zinc-900 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-950 text-white shadow-sm">
              <BookOpenText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                多媒体笔记工作台操作手册
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                当前稳定版：从素材、核对到协作输出的一份完整说明。
              </p>
            </div>
          </div>
          <Button
            asChild
            className="w-fit rounded-full"
            size="sm"
            variant="outline"
          >
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回入口
            </Link>
          </Button>
        </header>

        <section className="overflow-hidden rounded-3xl border border-indigo-100 bg-[radial-gradient(circle_at_top_right,_#e0e7ff,_transparent_38%),linear-gradient(135deg,_#ffffff,_#f5f7ff)] p-6 shadow-sm sm:p-8">
          <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-50">
            当前版本使用指南
          </Badge>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                从一份素材，到一条可追溯的知识链路。
              </h2>
              <p className="mt-3 text-sm leading-7 text-zinc-600 sm:text-base">
                工作台现在支持平台视频、本地视频、录音、双源会议/培训和文档五类素材；可选关键画面和人工复核，并将结果写入当前启用的飞书或钉钉连接器。所有已完成任务都可回到转化记录核对来源、状态和后续处理动作。
              </p>
            </div>
            <Button
              asChild
              className="rounded-full bg-zinc-950 px-5 hover:bg-zinc-800"
            >
              <Link to="/settings">
                先检查配置
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-7" data-ai-section-type="card-list">
          <SectionHeading
            description="首次使用先完成配置；日常使用可直接从第二步开始。"
            icon={ListChecks}
            title="统一工作流程"
          />
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {WORKFLOW_STEPS.map((step: ManualStep, index: number) => {
              const Icon: LucideIcon = step.icon;
              return (
                <Card
                  className="relative border-zinc-200 bg-white shadow-sm"
                  key={step.title}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-bold tracking-widest text-zinc-400">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 font-bold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      {step.description}
                    </p>
                  </CardContent>
                  {index < WORKFLOW_STEPS.length - 1 ? (
                    <ArrowRight className="absolute -right-5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-zinc-300 md:block" />
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.04fr_0.96fr]">
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <SectionHeading
                description="首次使用或环境变化后，请先运行一次自动检测。"
                icon={Settings2}
                title="1. 首次配置：先让系统具备可用输出"
              />
              <ol className="mt-5 space-y-4 text-sm leading-6 text-zinc-600">
                <li>
                  <strong className="text-zinc-900">01. 自动检测：</strong>
                  打开“参数配置”，在“开始使用”中查看文档、本地音视频、平台链接、总结模型和输出位置的就绪状态。
                </li>
                <li>
                  <strong className="text-zinc-900">02. 选择连接器：</strong>
                  在“连接器”中启用飞书或钉钉。系统一次只向当前选择的一个连接器写入笔记和待办，切换前请确认目标位置。
                </li>
                <li>
                  <strong className="text-zinc-900">03. 按需配置转录：</strong>
                  在“模型服务与转录”中先添加 API 提供者，再分别选择转录模型和 LLM
                  总结模型；腾讯 ASR 仍可在同一页面直接维护原有参数。
                </li>
                <li>
                  <strong className="text-zinc-900">04. 选择处理方式：</strong>
                  新建转录任务时会沿用已保存的 API 大模型或腾讯 ASR 资源包选择，并在处理面板显示实际提供者与模型。
                </li>
              </ol>
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <strong>数据边界：</strong>API Key
                只以脱敏状态显示；如启用外部模型或截图
                AI，请只处理已获授权、可以发送给外部服务的内容。
              </div>
              <Button
                asChild
                className="mt-5 rounded-full"
                size="sm"
                variant="outline"
              >
                <Link to="/settings">
                  打开参数配置 <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <SectionHeading
                description="两种风格共用同一份素材处理链路。"
                icon={FileOutput}
                title="2. 选择笔记风格和输出预期"
              />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm leading-6 text-indigo-950">
                  <h3 className="font-bold">学习笔记</h3>
                  <p className="mt-2">
                    适合课程、书籍、报告和经验分享：强调知识结构、重点复习与行动清单。
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-950">
                  <h3 className="font-bold">会议纪要</h3>
                  <p className="mt-2">
                    适合同步会、访谈和培训：重点呈现议题、决策、待办和责任人。
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-zinc-200 p-4 text-sm leading-6 text-zinc-600">
                <strong className="text-zinc-900">提示词模板：</strong>
                在“参数配置 →
                提示词模板”中分别编辑两种风格。先保存草稿，再点击发布；只有发布中的版本会用于后续新任务，历史任务会保留当时的提示词快照。
              </div>
              <Button
                asChild
                className="mt-5 rounded-full"
                size="sm"
                variant="outline"
              >
                <Link to="/note-templates">
                  管理提示词模板 <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10">
          <SectionHeading
            description="按素材来源选择入口。文件限制以页面实时提示为准。"
            icon={MonitorUp}
            title="3. 五类素材的正确处理方式"
          />
          <div
            className="mt-4 grid gap-4 lg:grid-cols-2"
            data-ai-section-type="card-list"
          >
            {SOURCE_GUIDES.map((guide: SourceGuide) => {
              const Icon: LucideIcon = guide.icon;
              return (
                <Card
                  className="border-zinc-200 bg-white shadow-sm"
                  key={guide.title}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold">{guide.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-zinc-500">
                            {guide.description}
                          </p>
                        </div>
                      </div>
                      <Button
                        asChild
                        className="rounded-full"
                        size="sm"
                        variant="outline"
                      >
                        <Link to={guide.path}>进入入口</Link>
                      </Button>
                    </div>
                    <ol className="mt-5 space-y-2 text-sm leading-6 text-zinc-600">
                      {guide.steps.map((step: string, index: number) => (
                        <li className="flex gap-2" key={step}>
                          <span className="font-bold text-zinc-400">
                            {index + 1}.
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-4 rounded-xl bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">
                      {guide.limit}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <SectionHeading
                description="适用于平台视频、本地视频和双源资料。"
                icon={ImageIcon}
                title="4. 关键画面：可选，而非必选"
              />
              <p className="mt-5 text-sm leading-6 text-zinc-600">
                默认关闭。开启后，系统先从视频提取原始截图，再根据你的选择自动发布或等待人工确认。只有需要保留
                PPT、图表、演示步骤等画面证据时才建议启用。
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
                <li>
                  <strong className="text-zinc-900">截图密度：</strong>
                  根据内容长度选择紧凑、标准或详细；密度越高，处理时间和候选画面通常越多。
                </li>
                <li>
                  <strong className="text-zinc-900">发布方式：</strong>
                  “自动选图并发布”由系统筛选；“人工确认后发布”会暂停在候选画面，待你选择后再继续。
                </li>
                <li>
                  <strong className="text-zinc-900">图片输出：</strong>
                  可选仅原始截图、原图加 AI 文字识别，或原图加 AI 派生信息图。
                </li>
              </ul>
              <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
                <ShieldCheck className="mr-1 inline h-4 w-4" />
                外部 AI
                截图处理默认关闭。开启前，请确认已筛选的截图可以发送给外部服务；原始截图会保留，不会被派生图替代。
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <SectionHeading
                description="完成不等于结束，所有后续动作集中在同一处。"
                icon={History}
                title="5. 转化记录：核对、处理和追溯"
              />
              <ul className="mt-5 space-y-3 text-sm leading-6 text-zinc-600">
                <li>
                  <strong className="text-zinc-900">定位：</strong>
                  按标题关键词、来源、素材类型、生成日期、结果和处理状态筛选；列表按时间分页展示。
                </li>
                <li>
                  <strong className="text-zinc-900">核对：</strong>
                  每条记录展示任务状态、耗时、笔记风格、提示词版本、关键画面状态和源文件保留情况；可打开总结笔记、原始转录稿或原文。
                </li>
                <li>
                  <strong className="text-zinc-900">处理：</strong>
                  单条或当前页多选标记为“已处理”。若关联待办可同步更新，具体结果以记录中的任务同步状态为准。
                </li>
                <li>
                  <strong className="text-zinc-900">重做：</strong>
                  根据转录稿和源文件是否仍可用，可重新生成原文、重新生成笔记、完整重处理或重新处理关键画面；页面只会展示当前记录可用的操作。
                </li>
              </ul>
              <Button
                asChild
                className="mt-5 rounded-full"
                size="sm"
                variant="outline"
              >
                <Link to="/conversion-history">
                  查看转化记录 <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-6 sm:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-emerald-950">
                6. 协作输出：以当前连接器为准
              </h2>
              <p className="mt-2 text-sm leading-7 text-emerald-900/80">
                飞书和钉钉都可作为笔记输出位置，但同一时刻只能启用一个连接器。任务完成后，系统将笔记写入当前连接器；待办创建、通知
                Webhook 和执行人能力则由该连接器的授权与配置决定。
              </p>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-emerald-950 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/75 p-4">
                  <strong>先确认输出位置</strong>
                  <br />
                  切换连接器会影响后续新任务，不会迁移既有笔记。
                </div>
                <div className="rounded-2xl bg-white/75 p-4">
                  <strong>以记录状态核验</strong>
                  <br />
                  通过“查看总结笔记”“查看待处理任务”和同步状态确认最终结果。
                </div>
                <div className="rounded-2xl bg-white/75 p-4">
                  <strong>通知独立看待</strong>
                  <br />
                  Webhook 发送失败不会改变笔记任务本身的完成结果。
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <SectionHeading
                description="这是一条独立的“飞书文档 → 多平台稿件”工作流。"
                icon={FileOutput}
                title="7. 飞书文章多平台导出"
              />
              <ol className="mt-5 space-y-3 text-sm leading-6 text-zinc-600">
                <li>
                  <strong className="text-zinc-900">01. 输入来源：</strong>
                  粘贴可访问的飞书文档 URL 或
                  token。建议源文档已整理好标题、分节、列表和图片。
                </li>
                <li>
                  <strong className="text-zinc-900">02. 选择目标：</strong>
                  可组合生成微信公众号 HTML 富文本、知乎 Markdown
                  和抖音短内容口播稿；按需选择保留或忽略图片，并选编辑稿或简洁稿。
                </li>
                <li>
                  <strong className="text-zinc-900">03. 人工发布：</strong>
                  在预览面板逐个平台检查，关注“需要人工确认的内容”，再复制或下载稿件到目标平台。当前工具不自动发布，也不跟踪外部平台的发布状态。
                </li>
              </ol>
              <Button
                asChild
                className="mt-5 rounded-full"
                size="sm"
                variant="outline"
              >
                <Link to="/article-export">
                  打开文章导出 <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <SectionHeading
                description="临时处理文件会自动清理；可重处理的源文件以记录页面状态为准。"
                icon={ShieldCheck}
                title="8. 安全与使用边界"
              />
              <ul className="mt-5 space-y-3 text-sm leading-6 text-zinc-600">
                <li>
                  只提交你有权处理、转写、保存和发布的音视频、文档及图片。
                </li>
                <li>
                  平台登录态只由本机工具在当前请求中读取，不保存到应用；不要向页面粘贴
                  Cookie、密钥或账号凭据。
                </li>
                <li>
                  临时媒体文件在处理后自动清理；为支持回看或重处理而保留的源对象，会在转化记录中明确显示状态。
                </li>
                <li>
                  AI
                  生成内容、转写、关键画面和多平台稿件都应在协作平台或正式发布前由人工核对，尤其是数字、术语、引用和行动项。
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 pb-8">
          <SectionHeading
            description="遇到问题时先看页面状态和转化记录，再按下面顺序定位。"
            icon={CloudCog}
            title="常见问题"
          />
          <div
            className="mt-4 grid gap-3 md:grid-cols-2"
            data-ai-section-type="card-list"
          >
            {FAQS.map((item: FaqItem) => (
              <Card
                className="border-zinc-200 bg-white shadow-sm"
                key={item.question}
              >
                <CardContent className="p-5">
                  <h3 className="font-semibold">{item.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {item.answer}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};

interface SectionHeadingProps {
  description: string;
  icon: LucideIcon;
  title: string;
}

const SectionHeading = ({
  description,
  icon: Icon,
  title,
}: SectionHeadingProps) => (
  <div className="flex items-center gap-2">
    <Icon className="h-5 w-5 text-indigo-600" />
    <div>
      <h2 className="font-bold">{title}</h2>
      <p className="text-sm text-zinc-500">{description}</p>
    </div>
  </div>
);

export default OperationManualPage;
