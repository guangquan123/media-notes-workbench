import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, FilePenLine, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { getNoteTemplates, updateNoteTemplate } from '@/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { NoteStyle, NoteTemplateConfig } from '@shared/api.interface';

const TEMPLATE_STYLES: readonly NoteStyle[] = ['learning', 'meeting'];

export default function NoteTemplatesPage() {
  const [templates, setTemplates] = useState<NoteTemplateConfig[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<NoteStyle>('learning');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (template: NoteTemplateConfig) => template.style === selectedStyle,
      ),
    [selectedStyle, templates],
  );

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await getNoteTemplates();
        setTemplates(response.items);
        const learning = response.items.find(
          (template: NoteTemplateConfig) => template.style === 'learning',
        );
        setContent(learning?.content || '');
      } catch {
        toast.error('笔记提示词加载失败');
      } finally {
        setLoading(false);
      }
    };
    void loadTemplates();
  }, []);

  const selectTemplate = (style: NoteStyle) => {
    const template = templates.find(
      (item: NoteTemplateConfig) => item.style === style,
    );
    setSelectedStyle(style);
    setContent(template?.content || '');
  };

  const save = async () => {
    if (!content.trim()) {
      toast.error('提示词内容不能为空');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateNoteTemplate(selectedStyle, { content });
      setTemplates((current: NoteTemplateConfig[]) =>
        current.map((item: NoteTemplateConfig) =>
          item.style === updated.style ? updated : item,
        ),
      );
      setContent(updated.content);
      toast.success('提示词已保存，下一次生成笔记时会读取最新配置');
    } catch {
      toast.error('提示词保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen overflow-auto bg-[#f7f7f5] text-[#161616]">
      <div className="mx-auto min-h-screen max-w-6xl px-5 py-7 md:px-10 md:py-10">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#3370ff] text-white shadow-sm">
              <FilePenLine className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">笔记提示词配置</p>
              <p className="text-xs text-black/45">
                保存后，每次生成都会读取最新的提示词
              </p>
            </div>
          </div>
          <Link
            className="inline-flex w-fit items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 shadow-sm transition hover:border-black/15 hover:text-black"
            to="/"
          >
            <ArrowLeft className="size-4" />
            返回入口
          </Link>
        </header>

        <section className="grid gap-7 py-8 lg:grid-cols-[0.34fr_0.66fr]">
          <aside className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3370ff]">
                Prompt center
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                让笔记按你的方式组织。
              </h1>
              <p className="mt-3 text-sm leading-6 text-black/50">
                每次生成笔记时，系统都会读取并将这里最新的提示词直接传给 AI。
              </p>
            </div>
            {TEMPLATE_STYLES.map((style: NoteStyle) => {
              const template = templates.find(
                (item: NoteTemplateConfig) => item.style === style,
              );
              const selected = style === selectedStyle;
              return (
                <button
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selected
                      ? 'border-[#3370ff] bg-[#edf3ff] shadow-sm'
                      : 'border-black/8 bg-white hover:border-black/18'
                  }`}
                  disabled={loading}
                  key={style}
                  onClick={() => selectTemplate(style)}
                  type="button"
                >
                  <p className="text-sm font-semibold">
                    {template?.label ||
                      (style === 'learning' ? '学习笔记' : '会议纪要')}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-black/48">
                    {template?.description}
                  </p>
                  <p className="mt-3 text-[11px] text-black/35">
                    {template?.isDefault
                      ? '使用默认提示词'
                      : '已使用你的自定义提示词'}
                  </p>
                </button>
              );
            })}
          </aside>

          <section className="rounded-[1.8rem] border border-black/8 bg-white p-5 shadow-[0_20px_60px_rgba(57,46,29,0.08)] md:p-7">
            <div className="flex flex-col gap-3 border-b border-black/7 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-lg font-semibold">
                  {selectedTemplate?.label}
                </p>
                <p className="mt-1 text-sm text-black/45">
                  可直接编辑；保存后，之后创建的任务会使用最新提示词。
                </p>
              </div>
              <Button
                className="bg-[#3370ff] text-white hover:bg-[#2864ea]"
                disabled={loading || saving}
                onClick={() => void save()}
              >
                {saving ? (
                  <Check className="size-4" />
                ) : (
                  <Save className="size-4" />
                )}
                保存提示词
              </Button>
            </div>
            <Textarea
              className="mt-5 min-h-[480px] resize-y rounded-2xl border-black/10 bg-[#fafaf8] p-4 font-mono text-sm leading-6"
              disabled={loading || saving}
              onChange={(event) => setContent(event.target.value)}
              value={content}
            />
            <p className="mt-3 text-xs leading-5 text-black/40">
              当前提示词不改变系统已有的真实性约束：原文未提供的信息不会被要求补写；不确定内容仍应标记为待人工确认。
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
