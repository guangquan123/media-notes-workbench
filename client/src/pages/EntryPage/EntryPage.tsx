import { ArrowRight, BookOpenText, FileText, Sparkles } from 'lucide-react';
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
    description:
      '把 B站和抖音视频整理成结构化学习笔记，适合做视频复盘、课程摘记和知识沉淀。',
    accent: 'from-[#fb7299]/15 to-[#fb7299]/5',
    badge: '旧入口',
    bullets: ['视频地址粘贴', '自动转录与总结', '写入飞书文档'],
    cta: '进入视频学习笔记',
  },
  {
    href: '/article-export',
    icon: FileText,
    title: '飞书文档多平台导出',
    description:
      '以飞书文档为源头，一键生成微信公众号、知乎、抖音等平台稿件，支持预览、复制和下载。',
    accent: 'from-[#d97706]/15 to-[#f59e0b]/5',
    badge: '新入口',
    bullets: ['文档 URL 输入', '公众号优先排版', '手动发布更稳妥'],
    cta: '进入文章导出',
  },
] as const;

export default function EntryPage() {
  return (
    <main className="min-h-screen overflow-auto bg-[radial-gradient(circle_at_top_left,_rgba(251,114,153,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(217,119,6,0.1),_transparent_26%),linear-gradient(180deg,#faf8f4_0%,#f7f6f2_48%,#f5f3ef_100%)] text-[#161616]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 md:px-10 md:py-8">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#111111] text-white shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">内容工作台</p>
              <p className="text-xs text-black/45">先选入口，再进入对应页面</p>
            </div>
          </div>
          <div className="status-pill is-ready">
            <span className="status-dot" />
            两个功能已分离，可自由切换
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-12">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-3 py-1.5 text-xs font-medium text-black/55 shadow-sm">
              <Sparkles className="size-3.5 text-[#d97706]" />
              入口分离，更清晰也更好返回
            </div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.04em] md:text-6xl">
              先选功能，
              <br />
              再开始处理内容。
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-black/52 md:text-lg">
              这里把“视频学习笔记”和“飞书文档多平台导出”拆成两个独立页面。
              进入后可以随时切换，也可以随时返回到这个入口页。
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-[#161616] px-5 text-white hover:bg-black/85">
                <Link to="/video-notes">
                  <BookOpenText className="size-4" />
                  进入视频学习笔记
                </Link>
              </Button>
              <Button
                asChild
                className="h-11 rounded-xl border-black/10 bg-white px-5 text-[#161616]"
                variant="outline"
              >
                <Link to="/article-export">
                  <FileText className="size-4" />
                  进入文章导出
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {FEATURE_CARDS.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  className="overflow-hidden border-black/8 bg-white/92 shadow-[0_20px_60px_rgba(57,46,29,0.08)]"
                  key={item.href}
                >
                  <CardHeader className={`space-y-3 bg-gradient-to-br ${item.accent}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-black/8 bg-white/85 px-3 py-1 text-xs font-semibold text-black/58">
                        <Icon className="size-3.5" />
                        {item.badge}
                      </div>
                      <div className="rounded-full border border-black/6 bg-white/85 px-3 py-1 text-[11px] font-medium text-black/42">
                        独立页面
                      </div>
                    </div>
                    <CardTitle className="text-2xl tracking-[-0.035em]">
                      {item.title}
                    </CardTitle>
                    <CardDescription className="max-w-xl text-sm leading-6 text-black/55">
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {item.bullets.map((bullet: string) => (
                        <div
                          className="rounded-2xl border border-black/7 bg-[#fafaf8] px-3 py-3 text-xs leading-5 text-black/54"
                          key={bullet}
                        >
                          {bullet}
                        </div>
                      ))}
                    </div>
                    <Button asChild className="h-11 w-full rounded-xl bg-[#161616] text-white hover:bg-black/85">
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
    </main>
  );
}
