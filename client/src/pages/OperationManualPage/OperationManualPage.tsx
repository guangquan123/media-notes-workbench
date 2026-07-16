import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  FileAudio,
  FileText,
  FileVideo,
  History,
  Layers3,
  ListChecks,
  ListTodo,
  Settings2,
  Upload,
  Waypoints,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ManualFlowStep {
  description: string;
  icon: LucideIcon;
  title: string;
}

interface SourceTypeGuide {
  description: string;
  icon: LucideIcon;
  steps: string[];
  title: string;
}

const MANUAL_FLOW_STEPS: ManualFlowStep[] = [
  {
    title: '选择资料类型',
    description: '先判断资料来自平台链接、视频、录音还是文档。',
    icon: Layers3,
  },
  {
    title: '提交资料',
    description: '粘贴链接或上传文件，并确认资料内容无误。',
    icon: Upload,
  },
  {
    title: '生成学习笔记',
    description: '平台提取内容并按当前已发布提示词生成笔记。',
    icon: FileText,
  },
  {
    title: '在飞书处理',
    description: '查看总结、待处理任务，并将完成事项标记为已处理。',
    icon: ListTodo,
  },
];

const SOURCE_TYPE_GUIDES: SourceTypeGuide[] = [
  {
    title: '平台视频学习笔记',
    description: '适合将 B 站、抖音等平台视频整理为结构化学习笔记。',
    icon: Waypoints,
    steps: [
      '复制完整视频链接',
      '在“视频学习笔记”中粘贴链接',
      '开始处理并等待生成结果',
    ],
  },
  {
    title: '本地视频学习笔记',
    description: '适合课程录屏、讲座录像等保存在本地的视频资料。',
    icon: FileVideo,
    steps: ['选择本地视频文件', '上传后确认处理进度', '生成后查看总结笔记'],
  },
  {
    title: '录音学习笔记',
    description: '适合课堂录音、访谈或语音备忘，提炼重点与行动项。',
    icon: FileAudio,
    steps: ['选择录音文件', '上传并等待内容提取', '查看生成的学习笔记'],
  },
  {
    title: '文档学习笔记',
    description: '适合报告、课件和书籍资料，帮助归纳知识结构。',
    icon: FileText,
    steps: ['选择需要整理的文档', '上传并等待解析完成', '打开学习笔记进行复盘'],
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
                从资料输入到飞书待处理，一次看懂完整使用流程。
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
            平台使用指南
          </Badge>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                把每次学习，沉淀成可追溯的知识。
              </h2>
              <p className="mt-3 text-sm leading-7 text-zinc-600 sm:text-base">
                选择资料类型并完成处理后，平台会生成学习笔记；新生成的笔记会同步创建飞书文档和当天到期的待处理任务，方便你后续归档与复盘。
              </p>
            </div>
            <Button
              asChild
              className="rounded-full bg-zinc-950 px-5 hover:bg-zinc-800"
            >
              <Link to="/">
                开始处理资料
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-7" data-ai-section-type="card-list">
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="font-bold">先了解整体流程</h2>
              <p className="text-sm text-zinc-500">
                按以下四步完成一次学习资料转化。
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {MANUAL_FLOW_STEPS.map((step: ManualFlowStep, index: number) => {
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
                  {index < MANUAL_FLOW_STEPS.length - 1 ? (
                    <ArrowRight className="absolute -right-5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-zinc-300 md:block" />
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-xs font-bold text-white">
                  1
                </span>
                <h2 className="font-bold">快速开始</h2>
              </div>
              <ol className="mt-5 space-y-4 text-sm leading-6 text-zinc-600">
                <li>
                  <span className="mr-2 font-bold text-zinc-900">01.</span>
                  进入平台入口，选择与资料匹配的处理类型。
                </li>
                <li>
                  <span className="mr-2 font-bold text-zinc-900">02.</span>
                  粘贴完整视频链接，或选择需要上传的本地文件。
                </li>
                <li>
                  <span className="mr-2 font-bold text-zinc-900">03.</span>
                  提交处理后，留意页面中的处理状态与结果。
                </li>
                <li>
                  <span className="mr-2 font-bold text-zinc-900">04.</span>
                  完成后进入“转化记录”，打开学习笔记或飞书待处理任务。
                </li>
              </ol>
              <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <strong>小提示：</strong>
                若希望笔记呈现方式更贴合你的习惯，请先完成提示词配置并发布。
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-xs font-bold text-white">
                  2
                </span>
                <h2 className="font-bold">选择正确的资料类型</h2>
              </div>
              <div
                className="mt-5 grid gap-3 sm:grid-cols-2"
                data-ai-section-type="card-menu"
              >
                {SOURCE_TYPE_GUIDES.map((guide: SourceTypeGuide) => {
                  const Icon: LucideIcon = guide.icon;
                  return (
                    <div
                      className="rounded-2xl border border-zinc-200 p-4"
                      key={guide.title}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="text-sm font-bold">{guide.title}</h3>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-zinc-500">
                        {guide.description}
                      </p>
                      <ol className="mt-3 space-y-1 text-xs leading-5 text-zinc-600">
                        {guide.steps.map((step: string, stepIndex: number) => (
                          <li key={step}>
                            <span className="mr-1.5 text-zinc-400">
                              {stepIndex + 1}.
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold">提示词配置：保存不等于生效</h2>
                  <p className="text-sm text-zinc-500">
                    通过“提示词配置”管理笔记的表达方式与内容结构。
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-zinc-200 p-4 text-sm leading-6 text-zinc-600">
                  <strong className="text-zinc-900">编辑并保存：</strong>
                  保存的是当前草稿，方便继续修改，不会立即影响后续生成。
                </div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
                  <strong>点击发布：</strong>
                  发布后才会正式生效，同时新增一条提示词历史记录并标记为“使用中”。
                </div>
                <div className="rounded-2xl border border-zinc-200 p-4 text-sm leading-6 text-zinc-600">
                  <strong className="text-zinc-900">管理历史：</strong>
                  可查看历史版本、一键复制，并勾选两个版本进行差异对比，了解具体修改内容。
                </div>
              </div>
              <Button
                asChild
                className="mt-5 rounded-full"
                size="sm"
                variant="outline"
              >
                <Link to="/note-templates">
                  打开提示词配置 <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold">转化记录：找到并处理每一条笔记</h2>
                  <p className="text-sm text-zinc-500">
                    记录按生成日期倒序展示，每页最多显示 10 条。
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-zinc-600">
                <li>
                  <strong className="text-zinc-900">筛选：</strong>
                  可按资料类型、生成日期、成功/失败、待处理/已处理缩小范围。
                </li>
                <li>
                  <strong className="text-zinc-900">查看：</strong>
                  从单条记录打开总结笔记、待处理任务、原文或下载原文。
                </li>
                <li>
                  <strong className="text-zinc-900">处理：</strong>
                  支持选择多条当前页记录，批量标记为已处理；也可在单条记录中完成标记。
                </li>
                <li>
                  <strong className="text-zinc-900">追溯：</strong>
                  每条成功记录会显示生成时使用的提示词快照，便于回看笔记生成依据。
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
                飞书协同与待处理提醒
              </h2>
              <p className="mt-2 text-sm leading-7 text-emerald-900/80">
                从该功能启用后新生成的笔记，会同步创建对应的飞书文档和待处理任务：任务负责人是你的飞书账号，到期日为当天全天。
              </p>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-emerald-950 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/75 p-4">
                  <strong>1. 生成笔记</strong>
                  <br />
                  平台创建总结笔记与飞书待处理任务。
                </div>
                <div className="rounded-2xl bg-white/75 p-4">
                  <strong>2. 个人归档</strong>
                  <br />
                  你可将笔记文档移动到个人知识库继续整理。
                </div>
                <div className="rounded-2xl bg-white/75 p-4">
                  <strong>3. 标记已处理</strong>
                  <br />
                  处理完成后，在平台标记，飞书任务状态会同步更新。
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-emerald-900/70">
                历史存量记录不一定关联飞书任务；只有功能启用后的新生成笔记会创建该提醒。
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10 pb-8">
          <h2 className="font-bold">常见问题</h2>
          <div
            className="mt-4 grid gap-3 md:grid-cols-2"
            data-ai-section-type="card-list"
          >
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <h3 className="font-semibold">
                  为什么修改提示词后，笔记样式没有变化？
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  请确认修改后已点击“发布”。仅保存的内容仍是草稿，不会作为生成依据。
                </p>
              </CardContent>
            </Card>
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <h3 className="font-semibold">
                  为什么一条记录没有飞书待处理任务？
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  飞书任务仅面向该功能启用后新生成的笔记；较早的历史记录不会补建。
                </p>
              </CardContent>
            </Card>
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <h3 className="font-semibold">
                  标记已处理会删除笔记或原文吗？
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  不会。该操作用于更新处理状态，并同步完成关联的飞书待处理任务。
                </p>
              </CardContent>
            </Card>
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <h3 className="font-semibold">筛选后找不到记录怎么办？</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  请先清除资料类型、日期、状态等筛选条件，再从全部记录中查找。
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
};

export default OperationManualPage;
