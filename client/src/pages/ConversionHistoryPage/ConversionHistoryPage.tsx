import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileAudio,
  FileVideo,
  History,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { getNoteConversionHistory } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  NoteConversionRecord,
  NoteSourceType,
} from '@shared/api.interface';

const SOURCE_STYLES: Record<
  NoteSourceType,
  { accent: string; background: string }
> = {
  platform: {
    accent: '#fb7299',
    background: '#fff0f5',
  },
  video: {
    accent: '#e86f3d',
    background: '#fff2eb',
  },
  audio: {
    accent: '#168b75',
    background: '#eaf8f4',
  },
};

function getStatusCopy(record: NoteConversionRecord): string {
  if (record.status === 'completed') return '已完成';
  if (record.status === 'failed') return '失败';
  return '处理中';
}

function ConversionIcon({
  sourceType,
}: {
  sourceType: NoteSourceType;
}) {
  if (sourceType === 'audio') return <FileAudio className="size-5" />;
  return <FileVideo className="size-5" />;
}

export default function ConversionHistoryPage() {
  const [records, setRecords] = useState<NoteConversionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecords = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await getNoteConversionHistory();
      setRecords(response.items);
    } catch {
      toast.error('转化记录加载失败，请稍后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  return (
    <main className="min-h-screen overflow-auto bg-[radial-gradient(circle_at_top_right,_rgba(51,112,255,0.08),_transparent_28%),linear-gradient(180deg,#faf9f6_0%,#f5f4f0_100%)] text-[#161616]">
      <div className="mx-auto min-h-screen max-w-6xl px-5 py-7 md:px-10 md:py-10">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#161616] text-white shadow-sm">
              <History className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">转化记录</p>
              <p className="text-xs text-black/45">回看每一次知识沉淀</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="rounded-full border-black/8 bg-white text-black/62"
              disabled={refreshing}
              onClick={() => void loadRecords(true)}
              variant="outline"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              刷新
            </Button>
            <Button
              asChild
              className="rounded-full border-black/8 bg-white text-black/62"
              variant="outline"
            >
              <Link to="/">
                <ArrowLeft className="size-4" />
                返回入口
              </Link>
            </Button>
          </div>
        </header>

        <section className="py-10">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3370ff]">
                Conversion archive
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-5xl">
                过去学过什么，
                <br />
                在这里一目了然。
              </h1>
            </div>
            {!loading && records.length > 0 && (
              <p className="text-sm text-black/42">
                最近 {records.length} 条记录
              </p>
            )}
          </div>

          {loading ? (
            <div className="grid min-h-72 place-items-center rounded-[2rem] border border-black/7 bg-white/85">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-6 animate-spin text-[#3370ff]" />
                <p className="mt-3 text-sm text-black/45">正在整理历史记录…</p>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="grid min-h-72 place-items-center rounded-[2rem] border border-dashed border-black/12 bg-white/75 px-6 text-center">
              <div>
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-black/5 text-black/35">
                  <History className="size-6" />
                </div>
                <h2 className="mt-5 text-lg font-semibold">还没有转化记录</h2>
                <p className="mt-2 text-sm leading-6 text-black/45">
                  完成一次视频或录音转化后，记录会自动出现在这里。
                </p>
                <Button asChild className="mt-6 rounded-xl bg-[#161616] text-white">
                  <Link to="/">开始第一次转化</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record: NoteConversionRecord) => {
                const sourceStyle = SOURCE_STYLES[record.sourceType];
                return (
                  <article
                    className="group grid gap-5 rounded-3xl border border-black/7 bg-white/92 p-5 shadow-[0_14px_45px_rgba(40,35,29,0.055)] transition hover:-translate-y-0.5 hover:border-black/12 hover:shadow-[0_18px_55px_rgba(40,35,29,0.09)] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:p-6"
                    key={record.id}
                  >
                    <div
                      className="grid size-12 place-items-center rounded-2xl"
                      style={{
                        backgroundColor: sourceStyle.background,
                        color: sourceStyle.accent,
                      }}
                    >
                      <ConversionIcon sourceType={record.sourceType} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className="border-transparent"
                          style={{
                            backgroundColor: sourceStyle.background,
                            color: sourceStyle.accent,
                          }}
                          variant="outline"
                        >
                          {record.sourceLabel}
                        </Badge>
                        <Badge
                          variant={
                            record.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {getStatusCopy(record)}
                        </Badge>
                      </div>
                      <h2 className="mt-3 truncate text-lg font-semibold tracking-[-0.02em]">
                        {record.title}
                      </h2>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-black/42">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="size-3.5" />
                          {dayjs(record.startedAt).format('YYYY-MM-DD HH:mm')}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          {record.status === 'failed' ? (
                            <TriangleAlert className="size-3.5 text-red-500" />
                          ) : (
                            <CheckCircle2 className="size-3.5" />
                          )}
                          耗时 {record.durationLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex md:justify-end">
                      {record.documentUrl ? (
                        <Button
                          asChild
                          className="w-full rounded-xl bg-[#3370ff] text-white hover:bg-[#2864ea] md:w-auto"
                        >
                          <a
                            href={record.documentUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            查看飞书笔记
                            <ArrowUpRight className="size-4" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-black/35">
                          {record.status === 'processing'
                            ? '完成后可查看'
                            : '没有生成笔记'}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
