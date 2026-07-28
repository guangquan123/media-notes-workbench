import { ImageIcon, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  FrameDensity,
  FrameOutputMode,
  NoteVisualOptions,
} from '@shared/api.interface';

interface VisualOptionsPanelProps {
  disabled?: boolean;
  onChange: (value: NoteVisualOptions) => void;
  value: NoteVisualOptions;
}

const DEFAULT_ACTIVE: Exclude<NoteVisualOptions, { mode: 'disabled' }> = {
  allowExternalAi: false,
  density: 'standard',
  mode: 'automatic',
  outputMode: 'original',
};

export function VisualOptionsPanel({
  disabled,
  onChange,
  value,
}: VisualOptionsPanelProps) {
  const enabled = value.mode !== 'disabled';
  const active = enabled ? value : DEFAULT_ACTIVE;
  const update = (
    patch: Partial<Exclude<NoteVisualOptions, { mode: 'disabled' }>>,
  ) => onChange({ ...active, ...patch });

  return (
    <section className="mt-6 rounded-2xl border border-black/8 bg-[#f7f7f5] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ImageIcon className="size-4 text-[#4d5dff]" />
            关键画面
          </div>
          <p className="mt-1 text-xs leading-5 text-black/48">
            先保留原始截图，再按需补充 AI 识别或派生信息图。
          </p>
        </div>
        <Switch
          aria-label="启用关键画面"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange(checked ? DEFAULT_ACTIVE : { mode: 'disabled' })
          }
        />
      </div>
      {enabled && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-xs font-medium text-black/60">
            截图密度
            <Select
              disabled={disabled}
              onValueChange={(density) =>
                update({ density: density as FrameDensity })
              }
              value={active.density}
            >
              <SelectTrigger className="mt-2 w-full bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">精简 · 最多 6 张</SelectItem>
                <SelectItem value="standard">标准 · 最多 12 张</SelectItem>
                <SelectItem value="detailed">详细 · 最多 24 张</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-xs font-medium text-black/60">
            发布方式
            <Select
              disabled={disabled}
              onValueChange={(mode) =>
                update({ mode: mode as 'automatic' | 'review' })
              }
              value={active.mode}
            >
              <SelectTrigger className="mt-2 w-full bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">自动选图并发布</SelectItem>
                <SelectItem value="review">人工确认后发布</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-xs font-medium text-black/60">
            图片输出
            <Select
              disabled={disabled}
              onValueChange={(outputMode) =>
                update({ outputMode: outputMode as FrameOutputMode })
              }
              value={active.outputMode}
            >
              <SelectTrigger className="mt-2 w-full bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">仅原始截图</SelectItem>
                <SelectItem value="original_with_ai_notes">
                  原图 + AI 文字识别
                </SelectItem>
                <SelectItem value="original_with_ai_derivative">
                  原图 + AI 派生信息图
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          {active.outputMode !== 'original' && (
            <label className="flex items-center gap-3 rounded-xl border border-black/7 bg-white p-3 md:col-span-3">
              <Switch
                aria-label="允许外部 AI 处理截图"
                checked={active.allowExternalAi}
                disabled={disabled}
                onCheckedChange={(allowExternalAi) =>
                  update({ allowExternalAi })
                }
              />
              <span>
                <span className="flex items-center gap-1 text-xs font-semibold">
                  <ShieldCheck className="size-3.5" />
                  允许将已筛选截图发送给外部 AI
                </span>
                <span className="mt-1 block text-xs text-black/45">
                  默认关闭；关闭时只做本地提取、过滤和原图发布。
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </section>
  );
}
