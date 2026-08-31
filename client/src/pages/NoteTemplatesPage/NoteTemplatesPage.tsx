import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  Eye,
  FilePenLine,
  GitCompareArrows,
  History,
  LoaderCircle,
  Save,
  Send,
  X,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  getNoteTemplates,
  publishNoteTemplate,
  updateNoteTemplate,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type {
  NotePromptVersion,
  NoteStyle,
  NoteTemplateConfig,
} from '@shared/api.interface';
import { orderPromptVersions } from './prompt-version-display.utils';

const TEMPLATE_STYLES: readonly NoteStyle[] = ['learning', 'meeting'];
const MAX_TEMPLATE_LENGTH = 60000;

interface NoteTemplatesPageProps {
  embedded?: boolean;
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

function styleFallbackLabel(style: NoteStyle): string {
  return style === 'learning' ? '学习笔记' : '会议纪要';
}

export default function NoteTemplatesPage({
  embedded = false,
}: NoteTemplatesPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [templates, setTemplates] = useState<NoteTemplateConfig[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<NoteStyle>('learning');
  const [content, setContent] = useState('');
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (template: NoteTemplateConfig) => template.style === selectedStyle,
      ),
    [selectedStyle, templates],
  );
  const orderedVersions = useMemo(
    () =>
      orderPromptVersions(
        selectedTemplate?.activeVersionId,
        selectedTemplate?.history || [],
      ),
    [selectedTemplate],
  );
  const previewVersion = useMemo(
    () =>
      orderedVersions.find(
        (version: NotePromptVersion) => version.id === previewVersionId,
      ),
    [orderedVersions, previewVersionId],
  );
  const hasUnsavedChanges = Boolean(
    selectedTemplate && content !== selectedTemplate.draftContent,
  );

  useEffect(() => {
    const loadTemplates = async (): Promise<void> => {
      try {
        const response = await getNoteTemplates();
        setTemplates(response.items);
        const learning = response.items.find(
          (template: NoteTemplateConfig) => template.style === 'learning',
        );
        setContent(learning?.draftContent || learning?.publishedContent || '');
      } catch {
        toast.error('提示词加载失败，请刷新后重试');
      } finally {
        setLoading(false);
      }
    };

    void loadTemplates();
  }, []);

  const replaceTemplate = (updated: NoteTemplateConfig): void => {
    setTemplates((current: NoteTemplateConfig[]) =>
      current.map((item: NoteTemplateConfig) =>
        item.style === updated.style ? updated : item,
      ),
    );
  };

  const selectTemplate = (style: NoteStyle): void => {
    const template = templates.find(
      (item: NoteTemplateConfig) => item.style === style,
    );
    setSelectedStyle(style);
    setSelectedVersionIds([]);
    setPreviewVersionId(null);
    setContent(template?.draftContent || template?.publishedContent || '');
  };

  const saveDraft = async (): Promise<void> => {
    if (!content.trim()) {
      toast.error('提示词内容不能为空');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateNoteTemplate(selectedStyle, { content });
      replaceTemplate(updated);
      setContent(updated.draftContent);
      toast.success('草稿已保存，发布后才会传给 AI');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '草稿保存失败，请稍后重试';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async (): Promise<void> => {
    if (!content.trim()) {
      toast.error('请先填写提示词内容');
      return;
    }
    setPublishing(true);
    try {
      const draft = await updateNoteTemplate(selectedStyle, { content });
      const published = await publishNoteTemplate(selectedStyle);
      replaceTemplate(published);
      setContent(published.draftContent || draft.draftContent);
      setSelectedVersionIds([]);
      setPublishOpen(false);
      toast.success(
        `已发布为 V${published.activeVersionNumber || '新版本'}，后续生成将使用此版本`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '发布失败，请稍后重试';
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  const copyVersion = async (version: NotePromptVersion): Promise<void> => {
    try {
      await navigator.clipboard.writeText(version.content);
      toast.success(`V${version.versionNumber} 内容已复制`);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  const toggleVersion = (id: string, checked: boolean): void => {
    if (checked && selectedVersionIds.length === 2) {
      toast.error('最多选择两个版本，请先取消一个');
      return;
    }
    setSelectedVersionIds((current: string[]) =>
      checked
        ? [...current, id]
        : current.filter((versionId: string) => versionId !== id),
    );
  };

  const openCompare = (): void => {
    if (selectedVersionIds.length !== 2) {
      toast.error('请先勾选两个版本');
      return;
    }
    const params = new URLSearchParams({
      style: selectedStyle,
      left: selectedVersionIds[0],
      right: selectedVersionIds[1],
      returnTo: `${location.pathname}${location.search}`,
    });
    setHistoryOpen(false);
    navigate(`/note-templates/compare?${params.toString()}`);
  };

  if (loading) {
    return (
      <main
        className={
          embedded
            ? 'p-3 text-sm text-black/50'
            : 'min-h-screen bg-[#f6f7f5] p-8 text-sm text-black/50'
        }
      >
        <LoaderCircle className="mr-2 inline size-4 animate-spin" />
        正在读取提示词配置…
      </main>
    );
  }

  const currentVersion = selectedTemplate?.activeVersionNumber;
  const templateLabel =
    selectedTemplate?.label || styleFallbackLabel(selectedStyle);

  return (
    <main
      className={
        embedded
          ? 'text-[#161616]'
          : 'min-h-screen overflow-auto bg-[#f6f7f5] text-[#161616]'
      }
    >
      <div
        className={
          embedded
            ? ''
            : 'mx-auto min-h-screen max-w-7xl px-5 py-4 md:px-8 md:py-5'
        }
      >
        {!embedded && (
          <header className="flex items-center justify-between border-b border-black/8 pb-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-[#111315] text-white shadow-sm">
                <FilePenLine className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">提示词模板</p>
                <p className="text-xs text-black/45">
                  编辑、发布并管理生成规则
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/">
                <ArrowLeft className="size-4" />
                返回入口
              </Link>
            </Button>
          </header>
        )}

        <section className="grid gap-6 py-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-6">
          <aside className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3370ff]">
                Prompt center
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] md:text-3xl">
                提示词配置
              </h1>
              <p className="mt-2 text-sm leading-6 text-black/50">
                选择类型，编辑并发布。历史版本是独立的查看操作。
              </p>
            </div>
            <div className="space-y-2" aria-label="提示词类型">
              {TEMPLATE_STYLES.map((style: NoteStyle) => {
                const template = templates.find(
                  (item: NoteTemplateConfig) => item.style === style,
                );
                const selected = style === selectedStyle;
                return (
                  <button
                    className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370ff]/30 ${
                      selected
                        ? 'border-[#3370ff]/35 bg-[#edf3ff] shadow-sm'
                        : 'border-black/8 bg-white hover:border-black/15 hover:shadow-sm'
                    }`}
                    key={style}
                    onClick={(): void => selectTemplate(style)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-semibold">
                        {template?.label || styleFallbackLabel(style)}
                      </span>
                      {selected && (
                        <Check className="size-4 shrink-0 text-[#3370ff]" />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-black/45">
                      {template?.description || '自定义 AI 输出的组织方式。'}
                    </p>
                    <p className="mt-3 text-[11px] text-black/40">
                      {template?.activeVersionNumber
                        ? `当前发布 V${template.activeVersionNumber}`
                        : '使用系统默认提示词'}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 rounded-2xl border border-black/8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
            <header className="flex flex-col gap-4 border-b border-black/8 px-5 py-5 md:px-7 md:py-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{templateLabel}</h2>
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    {currentVersion
                      ? `当前发布 V${currentVersion}`
                      : '系统默认'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-black/45">
                  发布后才会传给 AI；草稿可以继续修改。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="border-black/10 bg-white text-black/65 hover:bg-black/5"
                  disabled={saving || publishing}
                  onClick={(): void => setHistoryOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <History className="size-4" />
                  版本管理
                  <span className="text-black/35">
                    {orderedVersions.length}
                  </span>
                </Button>
                <Button
                  className="bg-[#3370ff] text-white hover:bg-[#2864ea]"
                  disabled={saving || publishing}
                  onClick={(): void => setPublishOpen(true)}
                  size="sm"
                >
                  <Send className="size-4" />
                  发布生效
                </Button>
              </div>
            </header>

            <div className="px-5 py-5 md:px-7 md:py-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-black/45">
                <span>
                  当前生效：{currentVersion ? `V${currentVersion}` : '系统默认'}
                </span>
                <span>
                  {hasUnsavedChanges ? '有未保存修改' : '已同步当前草稿'}
                </span>
              </div>
              <Textarea
                aria-label={`${templateLabel}提示词内容`}
                className="min-h-[440px] resize-y rounded-xl border-black/10 bg-[#fafaf8] p-4 font-mono text-sm leading-6 shadow-none focus-visible:ring-[#3370ff]/25"
                disabled={saving || publishing}
                maxLength={MAX_TEMPLATE_LENGTH}
                onChange={(event): void => setContent(event.target.value)}
                value={content}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-black/40">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-600" />
                  系统真实性约束仍会保留
                </span>
                <span>
                  {content.length.toLocaleString()} /{' '}
                  {MAX_TEMPLATE_LENGTH.toLocaleString()} 字符
                </span>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-5">
                <p className="text-xs leading-5 text-black/45">
                  修改不会立即影响生成结果，保存后仍需发布才会生效。
                </p>
                <Button
                  disabled={saving || publishing || !hasUnsavedChanges}
                  onClick={(): void => void saveDraft()}
                  variant="outline"
                >
                  {saving ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {saving ? '正在保存' : '保存草稿'}
                </Button>
              </div>
            </div>
          </section>
        </section>
      </div>

      <Dialog
        onOpenChange={(open: boolean): void => {
          setHistoryOpen(open);
          if (!open) setPreviewVersionId(null);
        }}
        open={historyOpen}
      >
        <DialogContent className="!left-auto !right-0 !top-0 !h-dvh !max-h-none !w-full !max-w-xl !translate-x-0 !translate-y-0 gap-0 overflow-hidden rounded-none border-l border-black/10 p-0 sm:rounded-l-3xl">
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="border-b border-black/8 px-5 py-5 text-left md:px-7">
              <div className="flex items-start justify-between gap-4 pr-8">
                <div>
                  <DialogTitle className="text-xl tracking-[-0.03em]">
                    版本管理
                  </DialogTitle>
                  <DialogDescription className="mt-2 text-xs leading-5">
                    时间倒序展示。每个版本都可以单独查看，也可以勾选两个版本进行比较。
                  </DialogDescription>
                </div>
                <Button
                  aria-label="关闭版本管理"
                  className="-mr-2 -mt-2 shrink-0 text-black/45"
                  onClick={(): void => setHistoryOpen(false)}
                  size="icon"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#f5f7fb] px-3 py-2.5 text-xs">
                <span className="text-black/55">当前提示词</span>
                <span className="font-medium text-black/75">
                  {templateLabel} ·{' '}
                  {currentVersion ? `V${currentVersion}` : '系统默认'}
                </span>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#3370ff]/15 bg-[#edf3ff] px-3 py-2.5">
                <span className="text-xs font-semibold text-[#2864ea]">
                  已选择 {selectedVersionIds.length} / 2 个版本
                </span>
                <span className="text-[11px] text-black/45">
                  需要更换时，请先取消一个已选版本
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {orderedVersions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-black/12 bg-[#fafaf8] p-5 text-sm text-black/45">
                    暂无已发布版本。保存草稿后点击「发布生效」即可创建第一个版本。
                  </div>
                )}
                {orderedVersions.map((version: NotePromptVersion) => {
                  const isActive =
                    version.id === selectedTemplate?.activeVersionId;
                  const isSelected = selectedVersionIds.includes(version.id);
                  return (
                    <div
                      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-3 transition ${
                        isActive
                          ? 'border-[#3370ff]/30 bg-[#f7faff]'
                          : 'border-black/8 bg-white hover:border-black/15'
                      }`}
                      key={version.id}
                    >
                      <Checkbox
                        aria-label={`${isSelected ? '取消选择' : '选择'} V${version.versionNumber}`}
                        checked={isSelected}
                        disabled={
                          selectedVersionIds.length === 2 && !isSelected
                        }
                        id={`version-${version.id}`}
                        onCheckedChange={(checked: boolean): void =>
                          toggleVersion(version.id, checked)
                        }
                      />
                      <button
                        className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370ff]/30"
                        onClick={(): void => setPreviewVersionId(version.id)}
                        type="button"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            V{version.versionNumber}
                          </span>
                          {isActive ? (
                            <Badge className="border-[#3370ff]/20 bg-[#edf3ff] text-[#2864ea]">
                              当前生效
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-black/35">
                              历史版本
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-black/45">
                          {formatDate(version.publishedAt)} ·{' '}
                          {version.content.length.toLocaleString()} 字符
                        </p>
                      </button>
                      <div className="flex items-center gap-1.5">
                        <Button
                          aria-label={`查看 V${version.versionNumber} 内容`}
                          className="shrink-0"
                          onClick={(): void => setPreviewVersionId(version.id)}
                          size="icon"
                          variant="ghost"
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          aria-label={`复制 V${version.versionNumber}`}
                          className="shrink-0"
                          onClick={(): void => void copyVersion(version)}
                          size="icon"
                          variant="ghost"
                        >
                          <ClipboardCopy className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {previewVersion && (
                <section className="mt-5 rounded-xl border border-black/8 bg-[#fafaf8] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        查看 V{previewVersion.versionNumber}
                      </p>
                      <p className="mt-1 text-xs text-black/45">
                        {previewVersion.id === selectedTemplate?.activeVersionId
                          ? '当前生效版本'
                          : '历史版本'}{' '}
                        · {formatDate(previewVersion.publishedAt)}
                      </p>
                    </div>
                    <Button
                      aria-label="关闭版本内容预览"
                      onClick={(): void => setPreviewVersionId(null)}
                      size="icon"
                      variant="ghost"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-black/8 bg-white p-3 font-mono text-xs leading-6 text-black/65">
                    {previewVersion.content}
                  </pre>
                </section>
              )}
            </div>

            <footer className="border-t border-black/8 bg-white px-5 py-4 md:px-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-black/45">
                  版本比较不会改变当前生效版本。
                </p>
                <Button
                  className="bg-[#3370ff] text-white hover:bg-[#2864ea]"
                  disabled={selectedVersionIds.length !== 2}
                  onClick={openCompare}
                >
                  <GitCompareArrows className="size-4" />
                  查看差异
                </Button>
              </div>
            </footer>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setPublishOpen} open={publishOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle>确认发布提示词？</DialogTitle>
            <DialogDescription className="pt-1 text-sm leading-6">
              发布后，后续新生成的笔记将使用这份内容。当前已生效版本不会被删除。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 rounded-xl bg-[#f5f7fb] p-3 text-xs leading-5 text-black/55">
            {templateLabel} · 当前编辑 {content.length.toLocaleString()} 字符
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              onClick={(): void => setPublishOpen(false)}
              variant="outline"
            >
              取消
            </Button>
            <Button
              className="bg-[#3370ff] text-white hover:bg-[#2864ea]"
              disabled={publishing}
              onClick={(): void => void publish()}
            >
              {publishing && <LoaderCircle className="size-4 animate-spin" />}
              {publishing ? '正在发布' : '确认发布'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
