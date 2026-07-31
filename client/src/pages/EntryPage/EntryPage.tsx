import {
  ArrowRight,
  BookOpenText,
  FileAudio,
  FileText,
  FileVideo,
  History,
  MessageSquareText,
  ScanSearch,
  Settings2,
  type LucideIcon,
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
import { Image } from '@/components/ui/image';

interface FeatureCard {
  badge: string;
  bullets: readonly string[];
  cta: string;
  description: string;
  gridClassName: string;
  href: string;
  icon: LucideIcon;
  title: string;
}

const ENTRY_LOGO_URL: string = new URL(
  'icons/zhiji-logo.svg?v=3',
  document.baseURI,
).toString();

const FEATURE_CARDS: readonly FeatureCard[] = [
  {
    href: '/paired-media-notes',
    icon: ScanSearch,
    title: '双源会议 / 培训笔记',
    description: '同时上传视频和录音，对齐后用画面与语音交叉验证。',
    badge: '视频 + 录音',
    bullets: ['时间对齐', '关键画面', '冲突标记'],
    cta: '上传双文件',
    gridClassName: '',
  },
  {
    href: '/video-notes',
    icon: BookOpenText,
    title: '视频学习笔记',
    description: '将 B站和抖音视频整理为结构化学习笔记。',
    badge: '平台视频',
    bullets: ['视频地址', '自动转录', '飞书笔记'],
    cta: '开始处理',
    gridClassName: '',
  },
  {
    href: '/local-video-notes',
    icon: FileVideo,
    title: '本地视频学习笔记',
    description: '上传课程、讲座或屏幕录制，提取内容并生成笔记。',
    badge: '视频文件',
    bullets: ['文件上传', '音轨提取', '处理进度'],
    cta: '上传视频',
    gridClassName: '',
  },
  {
    href: '/audio-notes',
    icon: FileAudio,
    title: '录音学习笔记',
    description: '上传课堂录音、访谈或语音备忘，提炼重点与行动项。',
    badge: '录音文件',
    bullets: ['多种格式', '自动切片', '学习笔记'],
    cta: '上传录音',
    gridClassName: 'lg:col-start-2',
  },
  {
    href: '/document-notes',
    icon: FileText,
    title: '文档学习笔记',
    description: '上传书籍、报告、课件或课程资料，融合沉淀知识结构。',
    badge: '文档文件',
    bullets: ['多文件融合', '原文解析', '飞书归档'],
    cta: '上传文档',
    gridClassName: 'lg:col-start-4',
  },
];

export default function EntryPage() {
  return (
    <main className="min-h-screen overflow-auto bg-[#f4f6f8] text-[#111315]">
      <div className="mx-auto flex min-h-screen max-w-[1480px] flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="flex items-center gap-3">
            <Image
              alt="多媒体笔记工作台"
              className="size-11 shrink-0 rounded-xl shadow-[0_6px_18px_rgba(26,139,210,0.15)]"
              decoding="sync"
              height={44}
              loading="eager"
              src={ENTRY_LOGO_URL}
              width={44}
            />
            <div>
              <p className="text-sm font-semibold">多媒体笔记工作台</p>
              <p className="mt-0.5 text-xs text-black/42">
                让每份资料都留下可追溯的知识轨迹
              </p>
            </div>
          </div>
          <nav
            aria-label="工作台辅助导航"
            className="flex flex-wrap gap-2 md:justify-end"
          >
            <Button
              asChild
              className="rounded-full bg-[#111315] text-white transition-colors hover:bg-[#178fd2]"
              size="sm"
            >
              <Link to="/settings">
                <Settings2 className="size-3.5" />
                参数配置
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-white text-black/65 transition-colors hover:bg-white hover:text-[#087fbe]"
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
              className="rounded-full bg-white text-black/65 transition-colors hover:bg-white hover:text-[#087fbe]"
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
              className="rounded-full bg-white text-black/65 transition-colors hover:bg-white hover:text-[#087fbe]"
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
              className="rounded-full bg-white text-black/65 transition-colors hover:bg-white hover:text-[#087fbe]"
              size="sm"
              variant="outline"
            >
              <Link to="/operation-manual">
                <BookOpenText className="size-3.5" />
                操作手册
              </Link>
            </Button>
          </nav>
        </header>

        <section className="flex flex-1 items-center py-4 lg:py-3">
          <div
            className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-6"
            data-ai-section-type="card-menu"
          >
            {FEATURE_CARDS.map((item) => {
              const Icon: LucideIcon = item.icon;
              return (
                <Card
                  className={`entry-card group relative flex min-h-[264px] flex-col overflow-hidden rounded-lg border-black/8 bg-white shadow-[0_12px_36px_rgba(18,24,40,0.055)] transition duration-300 motion-reduce:transition-none hover:-translate-y-1 hover:border-[#1b9dde]/40 hover:shadow-[0_20px_48px_rgba(28,106,151,0.14)] focus-within:-translate-y-1 focus-within:border-[#1b9dde]/40 focus-within:shadow-[0_20px_48px_rgba(28,106,151,0.14)] lg:col-span-2 lg:min-h-[250px] xl:min-h-[264px] ${item.gridClassName}`}
                  key={item.href}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-[#1b9dde] transition-transform duration-300 motion-reduce:transition-none group-hover:scale-x-100 group-focus-within:scale-x-100" />
                  <CardHeader className="relative space-y-3 p-5 pb-2">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1b9dde]/16 bg-[#edf8fd] px-3 py-1 text-xs font-semibold text-[#356274] transition duration-300 motion-reduce:transition-none group-hover:border-[#1b9dde]/30 group-hover:bg-[#e4f5fc] group-hover:text-[#087fbe] group-focus-within:border-[#1b9dde]/30 group-focus-within:bg-[#e4f5fc] group-focus-within:text-[#087fbe]">
                      <Icon className="size-3.5 transition-transform duration-300 motion-reduce:transition-none group-hover:scale-110 group-focus-within:scale-110" />
                      {item.badge}
                    </div>
                    <CardTitle className="text-xl tracking-normal text-[#111315]">
                      {item.title}
                    </CardTitle>
                    <CardDescription className="min-h-10 text-sm leading-5 text-black/48">
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative flex flex-1 flex-col gap-4 p-5 pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      {item.bullets.map((bullet: string) => (
                        <div
                          className="rounded-lg border border-black/7 bg-[#f7f8f8] px-2 py-2 text-center text-xs leading-5 text-black/52 transition-colors duration-300 group-hover:border-[#1b9dde]/18 group-hover:bg-[#f3fafc] group-hover:text-black/65 group-focus-within:border-[#1b9dde]/18 group-focus-within:bg-[#f3fafc] group-focus-within:text-black/65"
                          key={bullet}
                        >
                          {bullet}
                        </div>
                      ))}
                    </div>
                    <Button
                      asChild
                      className="mt-auto w-full rounded-lg bg-[#111315] text-white shadow-sm transition duration-300 motion-reduce:transition-none group-hover:bg-[#178fd2] group-hover:shadow-[0_10px_24px_rgba(23,143,210,0.22)] group-focus-within:bg-[#178fd2] group-focus-within:shadow-[0_10px_24px_rgba(23,143,210,0.22)] hover:bg-[#178fd2]"
                    >
                      <Link to={item.href}>
                        {item.cta}
                        <ArrowRight className="size-4 transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-1 group-focus-within:translate-x-1" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
