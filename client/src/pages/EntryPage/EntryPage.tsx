import {
  ArrowRight,
  BookOpenText,
  FileAudio,
  FileText,
  FileVideo,
  History,
  MessageSquareText,
  Settings2,
  Waypoints,
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
    href: '/document-notes',
    icon: FileText,
    title: '文档学习笔记',
    description: '上传书籍、报告、课件或课程资料，融合沉淀知识结构。',
    badge: '文档文件',
    bullets: ['多文件融合', '原文解析', '飞书归档'],
    cta: '上传文档',
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
                <Waypoints className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide">
                  多媒体笔记工作台
                </p>
                <p className="text-xs text-black/42">
                  让每份资料都留下可追溯的知识轨迹
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                className="rounded-full bg-[#111315] text-white hover:bg-[#4d5dff]"
                size="sm"
              >
                <Link to="/note-templates">
                  <Settings2 className="size-3.5" />
                  提示词配置
                </Link>
              </Button>
              <Button
                asChild
                className="rounded-full bg-white/90 text-black/65 hover:bg-white"
                size="sm"
                variant="outline"
              >
                <Link to="/note-inbox">
                  <MessageSquareText className="size-3.5" />
                  飞书收集箱
                </Link>
              </Button>
              <Button
                asChild
                className="rounded-full bg-white/90 text-black/65 hover:bg-white"
                size="sm"
                variant="outline"
              >
                <Link to="/note-inbox/messages">
                  <MessageSquareText className="size-3.5" />
                  收集消息
                </Link>
              </Button>
              <Button
                asChild
                className="rounded-full bg-white/90 text-black/65 hover:bg-white"
                size="sm"
                variant="outline"
              >
                <Link to="/conversion-history">
                  <History className="size-3.5" />
                  转化记录
                </Link>
              </Button>
              <Button
                asChild
                className="rounded-full bg-white/90 text-black/65 hover:bg-white"
                size="sm"
                variant="outline"
              >
                <Link to="/operation-manual">
                  <BookOpenText className="size-3.5" />
                  操作手册
                </Link>
              </Button>
            </div>
          </header>

          <section className="flex flex-1 items-center py-10 lg:py-14">
            <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {FEATURE_CARDS.map((item) => {
                const Icon = item.icon;
                return (
                  <Card
                    className="group relative flex min-h-[360px] flex-col overflow-hidden border-black/8 bg-white/88 shadow-[0_20px_60px_rgba(18,24,40,0.06)] backdrop-blur-xl transition duration-300 motion-reduce:transition-none hover:-translate-y-2 hover:scale-[1.015] hover:border-[#4d5dff]/45 hover:shadow-[0_30px_80px_rgba(44,59,150,0.16)] focus-within:-translate-y-2 focus-within:scale-[1.015] focus-within:border-[#4d5dff]/45 focus-within:shadow-[0_30px_80px_rgba(44,59,150,0.16)]"
                    key={item.href}
                  >
                    <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-[#4d5dff]/8 blur-3xl transition duration-500 motion-reduce:transition-none group-hover:scale-150 group-hover:bg-[#4d5dff]/25 group-focus-within:scale-150 group-focus-within:bg-[#4d5dff]/25" />
                    <CardHeader className="relative space-y-4 p-6 pb-3">
                      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-black/8 bg-[#f3f4ff] px-3 py-1 text-xs font-semibold text-black/58 transition duration-300 motion-reduce:transition-none group-hover:-translate-y-0.5 group-hover:border-[#4d5dff]/35 group-hover:bg-[#eaecff] group-hover:text-[#3848d7] group-focus-within:-translate-y-0.5 group-focus-within:border-[#4d5dff]/35 group-focus-within:bg-[#eaecff] group-focus-within:text-[#3848d7]">
                        <Icon className="size-3.5 transition duration-300 motion-reduce:transition-none group-hover:scale-110 group-focus-within:scale-110" />
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
                            className="rounded-xl border border-black/7 bg-[#f7f7f5] px-2 py-3 text-center text-xs leading-5 text-black/52 transition duration-300 motion-reduce:transition-none group-hover:border-[#4d5dff]/20 group-hover:bg-white group-hover:text-black/65 group-focus-within:border-[#4d5dff]/20 group-focus-within:bg-white group-focus-within:text-black/65"
                            key={bullet}
                          >
                            {bullet}
                          </div>
                        ))}
                      </div>
                      <Button
                        asChild
                        className="mt-auto h-11 w-full rounded-xl bg-[#111315] text-white shadow-sm transition duration-300 motion-reduce:transition-none group-hover:bg-[#4d5dff] group-hover:shadow-[0_12px_28px_rgba(77,93,255,0.28)] group-focus-within:bg-[#4d5dff] group-focus-within:shadow-[0_12px_28px_rgba(77,93,255,0.28)] hover:bg-[#4d5dff]"
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
        </div>
      </div>
    </main>
  );
}
