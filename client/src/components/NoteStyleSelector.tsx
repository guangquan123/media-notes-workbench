import { BookOpenText, UsersRound, type LucideIcon } from 'lucide-react';

import type { NoteStyle } from '@shared/api.interface';

interface NoteStyleSelectorProps {
  disabled?: boolean;
  value: NoteStyle;
  onChange: (value: NoteStyle) => void;
}

interface NoteStyleOption {
  description: string;
  icon: LucideIcon;
  label: string;
  value: NoteStyle;
}

const NOTE_STYLE_OPTIONS: readonly NoteStyleOption[] = [
  {
    value: 'learning',
    label: '学习笔记',
    description: '通用学习、系统总结与行动清单',
    icon: BookOpenText,
  },
  {
    value: 'meeting',
    label: '会议纪要',
    description: '议题、决策、待办与责任人',
    icon: UsersRound,
  },
];

export default function NoteStyleSelector({
  disabled = false,
  value,
  onChange,
}: NoteStyleSelectorProps) {
  return (
    <div>
      <span className="text-xs font-semibold text-black/55">笔记风格</span>
      <div
        aria-label="选择笔记风格"
        className="mt-2 grid grid-cols-2 gap-2"
        role="group"
      >
        {NOTE_STYLE_OPTIONS.map((option: NoteStyleOption) => {
          const Icon: LucideIcon = option.icon;
          const selected: boolean = option.value === value;
          return (
            <button
              aria-pressed={selected}
              className={`min-h-20 rounded-lg border px-3 py-3 text-left transition ${
                selected
                  ? 'border-black/70 bg-black text-white shadow-sm'
                  : 'border-black/9 bg-[#fafaf8] text-black hover:border-black/20'
              }`}
              disabled={disabled}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4" />
                {option.label}
              </span>
              <span
                className={`mt-1.5 block text-xs leading-4 ${
                  selected ? 'text-white/62' : 'text-black/40'
                }`}
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
