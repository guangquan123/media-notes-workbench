import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ClipboardCopy,
  FilePenLine,
  GitCompareArrows,
  History,
  Save,
  Send,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import {
  getNoteTemplates,
  publishNoteTemplate,
  updateNoteTemplate,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import type {
  NotePromptVersion,
  NoteStyle,
  NoteTemplateConfig,
} from '@shared/api.interface';
import { orderPromptVersions } from './prompt-version-display.utils';

const TEMPLATE_STYLES: readonly NoteStyle[] = ['learning', 'meeting'];
const MAX_TEMPLATE_LENGTH = 60000;

interface DiffLine {
  content: string;
  type: 'added' | 'removed' | 'unchanged';
}

function buildLineDiff(before: string, after: string): DiffLine[] {
  const beforeLines: string[] = before.split('\n');
  const afterLines: string[] = after.split('\n');
  const count: number = Math.max(beforeLines.length, afterLines.length);
  const lines: DiffLine[] = [];
  for (let index = 0; index < count; index += 1) {
    const previous: string | undefined = beforeLines[index];
    const next: string | undefined = afterLines[index];
    if (previous === next && previous !== undefined) {
      lines.push({ content: previous, type: 'unchanged' });
      continue;
    }
    if (previous !== undefined) lines.push({ content: previous, type: 'removed' });
    if (next !== undefined) lines.push({ content: next, type: 'added' });
  }
  return lines;
}

export default function NoteTemplatesPage() {
  const [templates, setTemplates] = useState<NoteTemplateConfig[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<NoteStyle>('learning');
  const [content, setContent] = useState('');
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (template: NoteTemplateConfig) => template.style === selectedStyle,
      ),
    [selectedStyle, templates],
  );
  const comparedVersions = useMemo(
    () =>
      selectedVersionIds
        .map((id: string) =>
          selectedTemplate?.history.find(
            (version: NotePromptVersion) => version.id === id,
          ),
        )
        .filter(
          (version: NotePromptVersion | undefined): version is NotePromptVersion =>
            Boolean(version),
        ),
    [selectedTemplate, selectedVersionIds],
  );
  const diffLines = useMemo((): DiffLine[] => {
    if (comparedVersions.length !== 2) return [];
    const ordered: NotePromptVersion[] = [...comparedVersions].sort(
      (left: NotePromptVersion, right: NotePromptVersion) =>
        left.versionNumber - right.versionNumber,
    );
    return buildLineDiff(ordered[0].content, ordered[1].content);
  }, [comparedVersions]);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await getNoteTemplates();
        setTemplates(response.items);
        const learning = response.items.find(
          (template: NoteTemplateConfig) => template.style === 'learning',
        );
        setContent(learning?.draftContent || '');
      } catch {
        toast.error('笔记提示词加载失败，请刷新后重试');
      } finally {
        setLoading(false);
      }
    };
    void loadTemplates();
  }, []);

  const replaceTemplate = (updated: NoteTemplateConfig) => {
    setTemplates((current: NoteTemplateConfig[]) =>
      current.map((item: NoteTemplateConfig) =>
        item.style === updated.style ? updated : item,
      ),
    );
  };

  const selectTemplate = (style: NoteStyle) => {
    const template = templates.find(
      (item: NoteTemplateConfig) => item.style === style,
    );
    setSelectedStyle(style);
    setSelectedVersionIds([]);
    setContent(template?.draftContent || '');
  };

  const saveDraft = async () => {
    if (!content.trim()) {
      toast.error('提示词内容不能为空');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateNoteTemplate(selectedStyle, { content });
      replaceTemplate(updated);
      setContent(updated.draftContent);
      toast.success('草稿已保存；发布后才会用于生成');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '提示词草稿保存失败，请稍后重试';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!content.trim()) {
      toast.error('请先填写提示词内容');
      return;
    }
    setPublishing(true);
    try {
      await updateNoteTemplate(selectedStyle, { content });
      const published = await publishNoteTemplate(selectedStyle);
      replaceTemplate(published);
      setContent(published.draftContent);
      setSelectedVersionIds([]);
      toast.success(`已发布为 V${published.activeVersionNumber}，后续生成将使用此版本`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '提示词发布失败，请稍后重试';
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  const copyVersion = async (version: NotePromptVersion) => {
    try {
      await navigator.clipboard.writeText(version.content);
      toast.success(`V${version.versionNumber} 已复制`);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  const toggleVersion = (id: string, checked: boolean) => {
    if (checked && selectedVersionIds.length === 2) {
      toast.error('最多选择两个版本进行对比');
      return;
    }
    setSelectedVersionIds((current: string[]) =>
      checked
        ? [...current, id]
        : current.filter((versionId: string) => versionId !== id),
    );
  };

  return (
    <main className="min-h-screen overflow-auto bg-[#f7f7f5] text-[#161616]">
      <div className="mx-auto min-h-screen max-w-7xl px-5 py-7 md:px-10 md:py-10">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#3370ff] text-white shadow-sm">
              <FilePenLine className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">提示词配置</p>
              <p className="text-xs text-black/45">保存为草稿，发布后才正式生效</p>
            </div>
          </div>
          <Link className="inline-flex w-fit items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 shadow-sm transition hover:border-black/15 hover:text-black" to="/">
            <ArrowLeft className="size-4" />返回入口
          </Link>
        </header>

        <section className="grid gap-7 py-8 lg:grid-cols-[0.28fr_0.72fr]">
          <aside className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3370ff]">Prompt center</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">让笔记按你的方式组织。</h1>
              <p className="mt-3 text-sm leading-6 text-black/50">发布中的版本才会直接传给 AI；草稿可反复修改。</p>
            </div>
            {TEMPLATE_STYLES.map((style: NoteStyle) => {
              const template = templates.find((item: NoteTemplateConfig) => item.style === style);
              const selected = style === selectedStyle;
              return <button className={`w-full rounded-2xl border p-4 text-left transition ${selected ? 'border-[#3370ff] bg-[#edf3ff] shadow-sm' : 'border-black/8 bg-white hover:border-black/18'}`} disabled={loading} key={style} onClick={() => selectTemplate(style)} type="button">
                <p className="text-sm font-semibold">{template?.label || (style === 'learning' ? '学习笔记' : '会议纪要')}</p>
                <p className="mt-1 text-xs leading-5 text-black/48">{template?.description}</p>
                <p className="mt-3 text-[11px] text-black/35">{template?.activeVersionNumber ? `当前发布 V${template.activeVersionNumber}` : '使用系统默认提示词'}</p>
              </button>;
            })}
          </aside>

          <div className="space-y-6">
            <section className="rounded-[1.8rem] border border-black/8 bg-white p-5 shadow-[0_20px_60px_rgba(57,46,29,0.08)] md:p-7">
              <div className="flex flex-col gap-3 border-b border-black/7 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-semibold">{selectedTemplate?.label}</p>
                  <p className="mt-1 text-sm text-black/45">当前生效：{selectedTemplate?.activeVersionNumber ? `V${selectedTemplate.activeVersionNumber}` : '系统默认提示词'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="bg-white text-black hover:bg-black/5" disabled={loading || saving || publishing} onClick={() => void saveDraft()} variant="outline"><Save className="size-4" />保存草稿</Button>
                  <Button className="bg-[#3370ff] text-white hover:bg-[#2864ea]" disabled={loading || saving || publishing} onClick={() => void publish()}><Send className="size-4" />{publishing ? '发布中' : '发布生效'}</Button>
                </div>
              </div>
              <Textarea className="mt-5 min-h-[420px] resize-y rounded-2xl border-black/10 bg-[#fafaf8] p-4 font-mono text-sm leading-6" disabled={loading || saving || publishing} maxLength={MAX_TEMPLATE_LENGTH} onChange={(event) => setContent(event.target.value)} value={content} />
              <div className="mt-3 flex justify-between gap-3 text-xs text-black/40"><span>系统真实性约束仍会保留。</span><span>{content.length.toLocaleString()} / {MAX_TEMPLATE_LENGTH.toLocaleString()} 字符</span></div>
            </section>

            <section className="rounded-[1.8rem] border border-black/8 bg-white p-5 md:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-lg font-semibold"><History className="size-5 text-[#3370ff]" />发布历史</p><p className="mt-1 text-sm text-black/45">勾选两个版本即可查看行级差异。</p></div><span className="rounded-full bg-[#edf3ff] px-3 py-1 text-xs font-medium text-[#2864ea]">已选 {selectedVersionIds.length}/2</span></div>
              <div className="mt-5 space-y-2">
                {orderPromptVersions(
                  selectedTemplate?.activeVersionId,
                  selectedTemplate?.history || [],
                ).map((version: NotePromptVersion) => {
                  const isActive: boolean =
                    version.id === selectedTemplate?.activeVersionId;
                  return <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${isActive ? 'border-[#3370ff]/35 bg-[#edf3ff]/60' : 'border-black/8'}`} key={version.id}><Checkbox checked={selectedVersionIds.includes(version.id)} id={version.id} onCheckedChange={(checked: boolean) => toggleVersion(version.id, checked)} /><label className="min-w-14 cursor-pointer text-sm font-semibold" htmlFor={version.id}>V{version.versionNumber}</label>{isActive ? <span className="rounded-full bg-[#3370ff] px-2 py-0.5 text-[11px] font-medium text-white">使用中</span> : <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/48">历史版本</span>}<span className="mr-auto text-xs text-black/45">{new Date(version.publishedAt).toLocaleString('zh-CN', { hour12: false })}</span><Button className="h-8 px-3" onClick={() => void copyVersion(version)} size="sm" variant="outline"><ClipboardCopy className="size-3.5" />复制</Button></div>;
                })}
                {selectedTemplate?.history.length === 0 && <p className="rounded-2xl bg-[#fafaf8] p-4 text-sm text-black/45">尚无已发布的自定义版本。保存草稿后点击“发布生效”。</p>}
              </div>
              {diffLines.length > 0 && <div className="mt-5 overflow-hidden rounded-2xl border border-black/8"><div className="flex items-center gap-2 border-b border-black/8 bg-[#fafaf8] px-4 py-3 text-sm font-semibold"><GitCompareArrows className="size-4 text-[#3370ff]" />V{Math.min(...comparedVersions.map((version: NotePromptVersion) => version.versionNumber))} → V{Math.max(...comparedVersions.map((version: NotePromptVersion) => version.versionNumber))}</div><pre className="max-h-96 overflow-auto p-4 text-xs leading-6">{diffLines.map((line: DiffLine, index: number) => <div className={line.type === 'added' ? 'bg-emerald-50 text-emerald-800' : line.type === 'removed' ? 'bg-rose-50 text-rose-800' : 'text-black/55'} key={`${line.type}-${index}`}>{line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}{line.content}</div>)}</pre></div>}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
