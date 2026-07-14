import {
  ArrowRight,
  BookOpenText,
  FileAudio,
  FileText,
  FileVideo,
  History,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const FEATURE_CARDS = [
  {
    href: '/video-notes',
    icon: BookOpenText,
    title: '视频学习笔记',
    description: '将 B站和抖音视频整理为结构化学习笔记。',
    badge: '平台视频',
    bullets: ['视频地址', '自动转录', '飞书笔记'],
    cta: '开始处理',
  },
  {
    href: '/local-video-notes',
    icon: FileVideo,
    title: '本地视频学习笔记',
    description: '上传课程、讲座或屏幕录制，提取内容并生成笔记。',
    badge: '视频文件',
    bullets: ['文件上传', '音轨提取', '处理进度'],
    cta: '上传视频',
  },
  {
    href: '/audio-notes',
    icon: FileAudio,
    title: '录音学习笔记',
    description: '上传课堂录音、访谈或语音备忘，提炼重点与行动项。',
    badge: '录音文件',
    bullets: ['多种格式', '自动切片', '学习笔记'],
    cta: '上传录音',
  },
  {
    href: '/pdf-notes',
    icon: FileText,
    title: 'PDF 学习笔记',
    description: '上传书籍、报告、论文或课程资料，沉淀知识结构。',
    badge: 'PDF 文件',
    bullets: ['原文解析', '知识提炼', '飞书归档'],
    cta: '上传 PDF',
  },
] as const;

export default function EntryPage() {
  return (
    <main className="min-h-screen overflow-auto bg-[#f6f7f5] text-[#111315]">
      <div className="min-h-screen bg-[radial-gradient(circle_at_82%_2%,rgba(77,93,255,0.09),transparent_24%),linear-gradient(135deg,rgba(17,19,21,0.025)_1px,transparent_1px)] bg-[size:auto,32px_32px]">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 md:px-10 md:py-8">
          <header className="flex flex-col gap-4 border-b border-black/8 pb-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-[#111315] text-white shadow-sm">
                <Sparkles className="size-5" />
              </div>
              <p className="text-sm font-semibold tracking-wide">学习工作台</p>
            </div>
            <Link
              className="inline-flex w-fit items-center gap-2 rounded-full border border-black/9 bg-white/80 px-3 py-1.5 text-xs text-black/55 shadow-sm backdrop-blur transition hover:border-black/20 hover:text-black"
              to="/conversion-history"
            >
              <History className="size-3.5" />
              转化记录
            </Link>
          </header>

          <section className="flex flex-1 items-center py-8 lg:py-12">
            <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {FEATURE_CARDS.map((item) => {
                const Icon = item.icon;
                return (
                  <Card
                    className="group relative flex min-h-[360px] flex-col overflow-hidden border-black/8 bg-white/88 shadow-[0_20px_60px_rgba(18,24,40,0.06)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[#4d5dff]/30 hover:shadow-[0_26px_70px_rgba(44,59,150,0.1)]"
                    key={item.href}
                  >
                    <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-[#4d5dff]/8 blur-3xl transition group-hover:bg-[#4d5dff]/14" />
                    <CardHeader className="relative space-y-4 p-6 pb-3">
                      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-black/8 bg-[#f3f4ff] px-3 py-1 text-xs font-semibold text-black/58">
                        <Icon className="size-3.5" />
                        {item.badge}
                      </div>
                      <CardTitle className="text-2xl tracking-[-0.04em] text-[#111315]">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="min-h-12 text-sm leading-6 text-black/48">
                        {item.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="relative flex flex-1 flex-col space-y-5 p-6 pt-4">
                      <div className="grid grid-cols-3 gap-2">
                        {item.bullets.map((bullet: string) => (
                          <div
                            className="rounded-xl border border-black/7 bg-[#f7f7f5] px-2 py-3 text-center text-xs leading-5 text-black/52"
                            key={bullet}
                          >
                            {bullet}
                          </div>
                        ))}
                      </div>
                      <Button
                        asChild
                        className="mt-auto h-11 w-full rounded-xl bg-[#111315] text-white shadow-sm hover:bg-[#4d5dff]"
                      >
                        <Link to={item.href}>
                          {item.cta}
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/8 py-5 text-xs text-black/40">
            <span>选择资料类型后开始生成学习笔记</span>
            <div className="flex items-center gap-2">
              <Link
                className="transition hover:text-black"
                to="/note-templates"
              >
                <Settings2 className="mr-1 inline size-3.5" />
                提示词配置
              </Link>
              <span className="text-black/15">/</span>
              <Link
                className="transition hover:text-black"
                to="/conversion-history"
              >
                <History className="mr-1 inline size-3.5" />
                转化记录
              </Link>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
