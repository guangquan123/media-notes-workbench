import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, LoaderCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  generateNoteJobFrameDerivative,
  getNoteJobFrames,
  publishNoteJobFrameSelection,
  updateNoteJobFrameSelection,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Image } from '@/components/ui/image';
import type {
  NoteJob,
  NoteJobFrame,
  NoteJobFrameListResponse,
} from '@shared/api.interface';

interface FrameReviewPanelProps {
  job: NoteJob;
  onPublished: (job: NoteJob) => void;
}

function formatTimestamp(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest]
    .filter((_, index) => hours > 0 || index > 0)
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function SortableFrame({
  busyDerivative,
  canGenerateDerivative,
  frame,
  onDerivative,
  onToggle,
  selected,
}: {
  busyDerivative: boolean;
  canGenerateDerivative: boolean;
  frame: NoteJobFrame;
  onDerivative: () => void;
  onToggle: () => void;
  selected: boolean;
}) {
  const sortable = useSortable({ id: frame.id, disabled: !selected });
  return (
    <article
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={`grid gap-4 rounded-2xl border p-3 md:grid-cols-[32px_220px_1fr] ${
        selected ? 'border-[#4d5dff]/35 bg-[#f7f8ff]' : 'border-black/8 bg-white'
      }`}
    >
      <div className="flex items-center gap-2 md:flex-col md:justify-center">
        <Checkbox
          aria-label={`选择 ${formatTimestamp(frame.globalTimestampMs)} 截图`}
          checked={selected}
          onCheckedChange={onToggle}
        />
        <button
          aria-label="拖动调整顺序"
          className="cursor-grab text-black/35 disabled:cursor-not-allowed disabled:opacity-25"
          disabled={!selected}
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </div>
      <Image
        alt={`${frame.sourceFileName} ${formatTimestamp(frame.timestampMs)} 关键截图`}
        className="aspect-video w-full rounded-xl border border-black/8 object-cover"
        src={frame.originalUrl}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-black/48">
          <span>{formatTimestamp(frame.globalTimestampMs)}</span>
          <span>评分 {(frame.score * 100).toFixed(0)}</span>
          <span>{frame.extractionType === 'scene' ? '场景切换' : '间隔补帧'}</span>
        </div>
        <p className="mt-2 text-sm font-semibold">
          {frame.analysis?.summary || '原始关键画面'}
        </p>
        {frame.analysis?.text && (
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-black/52">
            {frame.analysis.text}
          </p>
        )}
        {frame.derivativeUrl && (
          <Image
            alt="AI 派生信息图"
            className="mt-3 aspect-video w-full max-w-sm rounded-xl border object-cover"
            src={frame.derivativeUrl}
          />
        )}
        {selected &&
          canGenerateDerivative && (
            <Button
              className="mt-3"
              disabled={busyDerivative}
              onClick={onDerivative}
              size="sm"
              type="button"
              variant="outline"
            >
              {busyDerivative ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {frame.derivativeUrl ? '重新生成派生图' : '生成 AI 派生图'}
            </Button>
          )}
      </div>
    </article>
  );
}

export function FrameReviewPanel({
  job,
  onPublished,
}: FrameReviewPanelProps) {
  const [response, setResponse] = useState<NoteJobFrameListResponse | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [derivativeId, setDerivativeId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor));
  const canGenerateDerivative =
    job.visualOptions?.mode !== 'disabled' &&
    job.visualOptions?.allowExternalAi === true &&
    job.visualOptions.outputMode === 'original_with_ai_derivative';

  const load = async () => {
    const next = await getNoteJobFrames(job.id);
    setResponse(next);
    setOrderedIds(
      next.items
        .filter((frame) => frame.selectionStatus === 'selected')
        .sort(
          (left, right) =>
            (left.displayOrder ?? 0) - (right.displayOrder ?? 0),
        )
        .map((frame) => frame.id),
    );
  };

  useEffect(() => {
    void load().catch(() => toast.error('关键画面加载失败'));
  }, [job.id]);

  const orderedFrames = useMemo(() => {
    if (!response) return [];
    const selected = orderedIds
      .map((id) => response.items.find((frame) => frame.id === id))
      .filter((frame): frame is NoteJobFrame => Boolean(frame));
    const rejected = response.items.filter(
      (frame) => !orderedIds.includes(frame.id),
    );
    return [...selected, ...rejected];
  }, [orderedIds, response]);

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex >= 0 && newIndex >= 0) {
      setOrderedIds(arrayMove(orderedIds, oldIndex, newIndex));
    }
  };

  const publish = async () => {
    if (!response) return;
    setBusy(true);
    try {
      const selection = await updateNoteJobFrameSelection(job.id, {
        orderedFrameIds: orderedIds,
        revision: response.revision,
        selectedFrameIds: orderedIds,
      });
      const published = await publishNoteJobFrameSelection(job.id, {
        selectionRevision: selection.revision,
      });
      onPublished(published);
      toast.success('关键画面已确认，飞书笔记已创建');
    } catch {
      toast.error('保存或发布失败，请刷新关键画面后重试');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const generateDerivative = async (frameId: string) => {
    setDerivativeId(frameId);
    try {
      await generateNoteJobFrameDerivative(job.id, frameId);
      await load();
      toast.success('AI 派生图已生成，原始截图仍会保留');
    } catch {
      toast.error('AI 派生图生成失败');
    } finally {
      setDerivativeId(null);
    }
  };

  if (!response) {
    return (
      <div className="mt-5 flex items-center gap-2 text-sm text-black/55">
        <LoaderCircle className="size-4 animate-spin" />
        正在加载关键画面…
      </div>
    );
  }

  return (
    <section className="mt-6 rounded-[1.5rem] border border-[#4d5dff]/20 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">确认关键画面</p>
          <p className="mt-1 text-xs text-black/48">
            勾选要发布的画面；拖动已选画面调整正文顺序。已选 {orderedIds.length}{' '}
            / {response.totalItems}。
          </p>
        </div>
        <Button disabled={busy} onClick={publish} type="button">
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          确认并发布
        </Button>
      </div>
      {job.visualSummary?.warnings.map((warning) => (
        <p
          className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          key={warning.code}
        >
          {warning.message}
        </p>
      ))}
      <DndContext onDragEnd={dragEnd} sensors={sensors}>
        <SortableContext
          items={orderedIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-4 space-y-3">
            {orderedFrames.map((frame) => (
              <SortableFrame
                busyDerivative={derivativeId === frame.id}
                canGenerateDerivative={canGenerateDerivative}
                frame={frame}
                key={frame.id}
                onDerivative={() => void generateDerivative(frame.id)}
                onToggle={() =>
                  setOrderedIds((current) =>
                    current.includes(frame.id)
                      ? current.filter((id) => id !== frame.id)
                      : [...current, frame.id],
                  )
                }
                selected={orderedIds.includes(frame.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
