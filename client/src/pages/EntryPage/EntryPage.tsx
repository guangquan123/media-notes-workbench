import {
  ArrowRight,
  BookOpenText,
  FileAudio,
  FileText,
  FileVideo,
  History,
  ScanSearch,
  Settings2,
  type LucideIcon,
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

interface FeatureCard {
  badge: string;
  bullets: readonly string[];
  cta: string;
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}

const FEATURE_CARDS: readonly FeatureCard[] = [
  {
    href: '/paired-media-notes',
    icon: ScanSearch,
    title: '双源会议 / 培训笔记',
    description: '同时上传视频和录音，对齐后用画面与语音交叉验证。',
    badge: '视频 + 录音',
    bullets: ['时间对齐', '关键画面', '冲突标记'],
    cta: '上传双文件',
  },
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
];

interface FeatureCardItemProps {
  featured?: boolean;
  item: FeatureCard;
}

function FeatureCardItem({
  featured = false,
  item,
}: FeatureCardItemProps) {
  const Icon: LucideIcon = item.icon;
  return (
    <Card
      className={`entry-card group relative flex flex-col overflow-hidden rounded-lg bg-white shadow-[0_12px_36px_rgba(18,24,40,0.055)] transition duration-300 motion-reduce:transition-none hover:-translate-y-1 hover:border-[#2563eb]/40 hover:shadow-[0_20px_48px_rgba(37,99,235,0.14)] focus-within:-translate-y-1 focus-within:border-[#2563eb]/40 focus-within:shadow-[0_20px_48px_rgba(37,99,235,0.14)] ${
        featured
          ? 'min-h-[300px] border-[#2563eb]/25 bg-[#f8fbff] lg:min-h-[492px]'
          : 'min-h-[238px] border-black/8'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 origin-left bg-[#2563eb] transition-transform duration-300 motion-reduce:transition-none ${
          featured
            ? 'scale-x-100'
            : 'scale-x-0 group-hover:scale-x-100 group-focus-within:scale-x-100'
        }`}
      />
      <CardHeader
        className={`relative space-y-3 ${
          featured ? 'p-6 pb-3 lg:p-7 lg:pb-3' : 'p-5 pb-2'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#2563eb]/20 bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#1e40af] transition duration-300 motion-reduce:transition-none group-hover:border-[#2563eb]/40 group-hover:bg-[#dbeafe] group-hover:text-[#1d4ed8] group-focus-within:border-[#2563eb]/40 group-focus-within:bg-[#dbeafe] group-focus-within:text-[#1d4ed8]">
            <Icon
              aria-hidden="true"
              className="size-3.5 transition-transform duration-300 motion-reduce:transition-none group-hover:scale-110 group-focus-within:scale-110"
            />
            {item.badge}
          </div>
          {featured && (
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#2563eb] text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]">
              <Icon aria-hidden="true" className="size-5" />
            </div>
          )}
        </div>
        <CardTitle
          className={`tracking-normal text-[#111315] ${
            featured ? 'text-2xl lg:text-[26px]' : 'text-lg'
          }`}
        >
          {item.title}
        </CardTitle>
        <CardDescription
          className={`text-black/48 ${
            featured
              ? 'max-w-lg text-sm leading-6'
              : 'min-h-10 text-sm leading-5'
          }`}
        >
          {item.description}
        </CardDescription>
      </CardHeader>
      <CardContent
        className={`relative flex flex-1 flex-col gap-4 ${
          featured ? 'p-6 pt-3 lg:p-7 lg:pt-4' : 'p-5 pt-3'
        }`}
      >
        <div className={featured ? 'grid gap-2' : 'grid grid-cols-3 gap-2'}>
          {item.bullets.map((bullet: string, index: number) => (
            <div
              className={`rounded-lg border border-black/7 bg-[#f7f8f8] text-xs text-black/52 transition-colors duration-300 group-hover:border-[#2563eb]/20 group-hover:bg-[#f5f8ff] group-hover:text-black/65 group-focus-within:border-[#2563eb]/20 group-focus-within:bg-[#f5f8ff] group-focus-within:text-black/65 ${
                featured
                  ? 'flex items-center gap-3 px-3 py-3 text-left leading-5'
                  : 'px-2 py-2 text-center leading-5'
              }`}
              key={bullet}
            >
              {featured && (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#dbeafe] text-[11px] font-semibold text-[#1d4ed8]">
                  {String(index + 1).padStart(2, '0')}
                </span>
              )}
              {bullet}
            </div>
          ))}
        </div>
        <Button
          asChild
          className={`mt-auto w-full rounded-lg text-white shadow-sm transition duration-300 motion-reduce:transition-none group-hover:bg-[#2563eb] group-hover:shadow-[0_10px_24px_rgba(37,99,235,0.24)] group-focus-within:bg-[#2563eb] group-focus-within:shadow-[0_10px_24px_rgba(37,99,235,0.24)] hover:bg-[#2563eb] ${
            featured ? 'bg-[#2563eb]' : 'bg-[#111315]'
          }`}
        >
          <Link to={item.href}>
            {item.cta}
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-1 group-focus-within:translate-x-1"
            />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function EntryPage() {
  return (
    <main className="min-h-screen overflow-auto bg-[#f4f6f8] text-[#111315]">
      <div className="mx-auto flex min-h-screen max-w-[1480px] flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#111315] text-white shadow-sm">
              <Waypoints aria-hidden="true" className="size-5" />
            </div>
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
              className="rounded-full bg-[#111315] text-white transition-colors hover:bg-[#2563eb]"
              size="sm"
            >
              <Link to="/settings">
                <Settings2 className="size-3.5" />
                参数配置
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-white text-black/65 transition-colors hover:bg-white hover:text-[#1d4ed8]"
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
              className="rounded-full bg-white text-black/65 transition-colors hover:bg-white hover:text-[#1d4ed8]"
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
            className="grid w-full gap-3 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.4fr)]"
            data-ai-section-type="card-menu"
          >
            <FeatureCardItem featured item={FEATURE_CARDS[0]} />
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURE_CARDS.slice(1).map((item: FeatureCard) => (
                <FeatureCardItem item={item} key={item.href} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
