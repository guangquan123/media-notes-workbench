import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  FilePenLine,
  LoaderCircle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getNoteTemplates } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  NotePromptVersion,
  NoteStyle,
  NoteTemplateConfig,
} from '@shared/api.interface';
import { orderPromptVersions } from '@/pages/NoteTemplatesPage/prompt-version-display.utils';

type DiffType = 'added' | 'removed' | 'changed' | 'context';

interface DiffRow {
  left?: string;
  right?: string;
  type: DiffType;
}

interface ChangeItem {
  index: number;
  label: string;
  text: string;
  type: Exclude<DiffType, 'context'>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function styleLabel(style: NoteStyle): string {
  return style === 'learning' ? '学习笔记' : '会议纪要';
}

function buildDiff(left: string, right: string): DiffRow[] {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const rows: DiffRow[] = [];
  const max = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < max; index += 1) {
    const before = leftLines[index];
    const after = rightLines[index];
    if (before === after) {
      rows.push({ left: before, right: after, type: 'context' });
    } else if (before === undefined) {
      rows.push({ right: after, type: 'added' });
    } else if (after === undefined) {
      rows.push({ left: before, type: 'removed' });
    } else {
      rows.push({ left: before, right: after, type: 'changed' });
    }
  }
  return rows;
}

export default function NoteTemplatesComparePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const style = (searchParams.get('style') || 'learning') as NoteStyle;
  const leftId = searchParams.get('left') || '';
  const rightId = searchParams.get('right') || '';
  const returnTo = searchParams.get('returnTo') || '/settings?section=prompts';
  const [templates, setTemplates] = useState<NoteTemplateConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Exclude<DiffType, 'context'>>(
    'all',
  );
  const [activeChange, setActiveChange] = useState(0);

  useEffect(() => {
    const loadTemplates = async (): Promise<void> => {
      try {
        const response = await getNoteTemplates();
        setTemplates(response.items);
      } catch {
        toast.error('版本比较数据加载失败，请返回后重试');
      } finally {
        setLoading(false);
      }
    };
    void loadTemplates();
  }, []);

  const template = useMemo(
    () => templates.find((item: NoteTemplateConfig) => item.style === style),
    [style, templates],
  );
  const versions = useMemo(
    () =>
      orderPromptVersions(template?.activeVersionId, template?.history || []),
    [template],
  );
  const left = versions.find(
    (version: NotePromptVersion) => version.id === leftId,
  );
  const right = versions.find(
    (version: NotePromptVersion) => version.id === rightId,
  );
  const rows = useMemo(
    () => (left && right ? buildDiff(left.content, right.content) : []),
    [left, right],
  );
  const changes = useMemo((): ChangeItem[] => {
    return rows.flatMap((row: DiffRow, index: number) => {
      if (row.type === 'context') return [];
      return [
        {
          index,
          label:
            row.type === 'added'
              ? '新增'
              : row.type === 'removed'
                ? '删除'
                : '修改',
          text: row.right || row.left || '',
          type: row.type,
        },
      ];
    });
  }, [rows]);
  const summary = useMemo(
    () => ({
      added: rows.filter((row: DiffRow) => row.type === 'added').length,
      removed: rows.filter((row: DiffRow) => row.type === 'removed').length,
      changed: rows.filter((row: DiffRow) => row.type === 'changed').length,
    }),
    [rows],
  );

  const scrollToChange = (index: number): void => {
    setActiveChange(
      Math.max(
        0,
        changes.findIndex((change: ChangeItem) => change.index === index),
      ),
    );
    requestAnimationFrame(() => {
      document.getElementById(`diff-row-${index}-0`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  };

  const nextChange = (): void => {
    if (changes.length === 0) return;
    const nextIndex = (activeChange + 1) % changes.length;
    scrollToChange(changes[nextIndex].index);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f7f5] p-8 text-sm text-black/50">
        <LoaderCircle className="mr-2 inline size-4 animate-spin" />
        正在读取版本差异…
      </main>
    );
  }

  if (!template || !left || !right) {
    return (
      <main className="min-h-screen bg-[#f6f7f5] px-5 py-8 text-[#161616] md:px-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-black/8 bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold">无法打开版本比较</p>
          <p className="mt-2 text-sm leading-6 text-black/50">
            选择的版本不存在或已被更新，请返回当前提示词后重新选择。
          </p>
          <Button className="mt-5" onClick={(): void => navigate(returnTo)}>
            <ArrowLeft className="size-4" />
            返回当前提示词
          </Button>
        </div>
      </main>
    );
  }

  const visibleRows = rows.filter(
    (row: DiffRow) =>
      filter === 'all' || row.type === 'context' || row.type === filter,
  );
  return (
    <main className="min-h-screen overflow-auto bg-[#f6f7f5] text-[#161616]">
      <div className="mx-auto min-h-screen max-w-[1500px] px-5 py-7 md:px-10 md:py-9">
        <header className="border-b border-black/8 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-[#111315] text-white shadow-sm">
                <FilePenLine className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">提示词版本比较</p>
                <p className="text-xs text-black/45">
                  只读查看，不会改变当前生效版本
                </p>
              </div>
            </div>
            <Button
              onClick={(): void => navigate(returnTo)}
              size="sm"
              variant="outline"
            >
              <ArrowLeft className="size-4" />
              返回当前提示词
            </Button>
          </div>
        </header>

        <section className="py-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3370ff]">
                Prompt center / Compare
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                V{left.versionNumber} 与 V{right.versionNumber} 的改动
              </h1>
              <p className="mt-2 text-sm text-black/50">
                按行查看两个版本的新增、删除和修改内容。
              </p>
            </div>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
              {styleLabel(style)}
            </Badge>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm">
              <div className="grid grid-cols-2 border-b border-black/8">
                <div className="bg-[#fafaf8] px-4 py-4 md:px-6">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    V{left.versionNumber}
                    {left.id === template.activeVersionId && (
                      <Badge className="border-[#3370ff]/15 bg-[#edf3ff] text-[#2864ea]">
                        当前生效
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-black/45">
                    {formatDate(left.publishedAt)} ·{' '}
                    {left.content.length.toLocaleString()} 字符
                  </p>
                </div>
                <div className="bg-[#edf3ff] px-4 py-4 md:px-6">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#2864ea]">
                    V{right.versionNumber}
                    {right.id === template.activeVersionId && (
                      <Badge className="border-[#3370ff]/15 bg-white text-[#2864ea]">
                        当前生效
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-black/45">
                    {formatDate(right.publishedAt)} ·{' '}
                    {right.content.length.toLocaleString()} 字符
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-black/8 overflow-auto">
                {[0, 1].map((side: number) => (
                  <div className="min-w-[24rem] p-3 md:p-5" key={side}>
                    {visibleRows.map((row: DiffRow) => {
                      const index = rows.indexOf(row);
                      const text = side === 0 ? row.left : row.right;
                      return (
                        <div
                          className={`mb-1 grid grid-cols-[2.3rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-2 font-mono text-xs leading-6 ${row.type === 'added' ? 'bg-emerald-50 text-emerald-900' : row.type === 'removed' ? 'bg-rose-50 text-rose-900' : row.type === 'changed' ? 'bg-amber-50 text-amber-900' : 'text-black/55'}`}
                          id={`diff-row-${index}-${side}`}
                          key={`${index}-${side}`}
                        >
                          <span className="select-none text-right text-black/25">
                            {index + 1}
                          </span>
                          <span className="whitespace-pre-wrap break-words">
                            {text || ' '}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-black/8 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold">差异摘要</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                    <strong className="block text-lg">{summary.added}</strong>
                    新增
                  </div>
                  <div className="rounded-lg bg-rose-50 p-2 text-rose-700">
                    <strong className="block text-lg">{summary.removed}</strong>
                    删除
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
                    <strong className="block text-lg">{summary.changed}</strong>
                    修改
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(['all', 'added', 'removed', 'changed'] as const).map(
                    (item) => (
                      <button
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${filter === item ? 'border-[#111315] bg-[#111315] text-white' : 'border-black/10 text-black/55 hover:border-black/20'}`}
                        key={item}
                        onClick={(): void => setFilter(item)}
                        type="button"
                      >
                        {item === 'all'
                          ? '全部差异'
                          : item === 'added'
                            ? '新增'
                            : item === 'removed'
                              ? '删除'
                              : '修改'}
                      </button>
                    ),
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-black/8 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">改动导航</p>
                  <Button
                    className="h-7 px-2 text-xs"
                    onClick={nextChange}
                    size="sm"
                    variant="ghost"
                  >
                    下一个 <ChevronDown className="size-3.5 -rotate-90" />
                  </Button>
                </div>
                <div className="mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto">
                  {changes.map((change: ChangeItem, index: number) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${activeChange === index ? 'border-[#3370ff]/30 bg-[#edf3ff]' : 'border-black/8 hover:border-black/15'}`}
                      key={change.index}
                      onClick={(): void => scrollToChange(change.index)}
                      type="button"
                    >
                      <span className="text-[11px] font-semibold">
                        {change.label} · 第 {index + 1} 处
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-black/45">
                        {change.text}
                      </span>
                    </button>
                  ))}
                  {changes.length === 0 && (
                    <p className="text-xs text-black/45">
                      两个版本没有可见差异。
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-black/8 bg-[#fafaf8] p-4 text-xs leading-5 text-black/50">
                当前生效版本：
                <strong className="text-black/75">
                  V{template.activeVersionNumber || '系统默认'}
                </strong>
                。比较仅用于查看，不会自动发布内容。
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
