import {
  ArrowLeft,
  BotMessageSquare,
  FilePenLine,
  Settings2,
  Speech,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import ModelSettingsPage from '@/pages/ModelSettingsPage/ModelSettingsPage';
import NoteTemplatesPage from '@/pages/NoteTemplatesPage/NoteTemplatesPage';
import TranscriptionSettingsPage from '@/pages/TranscriptionSettingsPage/TranscriptionSettingsPage';

type SettingsSection = 'model' | 'prompts' | 'transcription';

interface SettingsSectionOption {
  description: string;
  icon: typeof FilePenLine;
  label: string;
  value: SettingsSection;
}

const SETTINGS_SECTIONS: readonly SettingsSectionOption[] = [
  {
    value: 'prompts',
    label: '提示词模板',
    description: '编辑、发布并对比笔记生成提示词。',
    icon: FilePenLine,
  },
  {
    value: 'transcription',
    label: '转录引擎',
    description: '管理腾讯云 ASR 和音频转录参数。',
    icon: Speech,
  },
  {
    value: 'model',
    label: '总结模型',
    description: '设置外部大模型的连接与启用状态。',
    icon: BotMessageSquare,
  },
];

function getSelectedSection(section: string | null): SettingsSection {
  if (
    section === 'model' ||
    section === 'prompts' ||
    section === 'transcription'
  ) {
    return section;
  }
  return 'prompts';
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSection: SettingsSection = getSelectedSection(
    searchParams.get('section'),
  );

  const selectSection = (section: SettingsSection): void => {
    setSearchParams({ section }, { replace: true });
  };

  return (
    <main className="min-h-screen overflow-auto bg-[#f6f7f5] text-[#161616]">
      <div className="min-h-screen bg-[radial-gradient(circle_at_84%_4%,rgba(77,93,255,0.1),transparent_25%),linear-gradient(135deg,rgba(17,19,21,0.025)_1px,transparent_1px)] bg-[size:auto,32px_32px]">
        <div className="mx-auto min-h-screen max-w-7xl px-5 py-7 md:px-10 md:py-10">
          <header className="border-b border-black/8 pb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-[#111315] text-white shadow-sm">
                  <Settings2 className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">参数配置</p>
                  <p className="text-xs text-black/45">
                    集中管理笔记生成所需的提示词、转录与模型参数
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 sm:items-end">
                <p className="text-xs leading-5 text-black/45 sm:max-w-xs sm:text-right">
                  密钥只会以脱敏状态显示，保存后不会回传到页面或写入日志。
                </p>
                <Button
                  asChild
                  className="rounded-full bg-white/85 text-black/65 hover:bg-white hover:text-black"
                  size="sm"
                  variant="outline"
                >
                  <Link to="/">
                    <ArrowLeft className="size-3.5" />
                    返回入口
                  </Link>
                </Button>
              </div>
            </div>
          </header>

          <div className="grid gap-7 py-7 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-9">
            <nav
              aria-label="配置模块"
              className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible"
            >
              {SETTINGS_SECTIONS.map(
                (item: SettingsSectionOption): ReactNode => {
                  const Icon = item.icon;
                  const isSelected: boolean = item.value === selectedSection;
                  return (
                    <Button
                      aria-current={isSelected ? 'page' : undefined}
                      className={`h-auto min-w-44 shrink-0 justify-start rounded-xl border px-4 py-3 text-left transition lg:min-w-0 ${
                        isSelected
                          ? 'border-[#4d5dff]/30 bg-[#111315] text-white hover:bg-[#111315]'
                          : 'border-black/8 bg-white/85 text-black/65 hover:bg-white hover:text-black'
                      }`}
                      key={item.value}
                      onClick={(): void => selectSection(item.value)}
                      variant="outline"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0" />
                      <span className="grid gap-1 whitespace-normal">
                        <span className="text-sm font-semibold">{item.label}</span>
                        <span
                          className={`text-xs font-normal leading-5 ${
                            isSelected ? 'text-white/62' : 'text-black/45'
                          }`}
                        >
                          {item.description}
                        </span>
                      </span>
                    </Button>
                  );
                },
              )}
            </nav>

            <section aria-live="polite" className="min-w-0">
              {selectedSection === 'prompts' && <NoteTemplatesPage embedded />}
              {selectedSection === 'transcription' && (
                <TranscriptionSettingsPage embedded />
              )}
              {selectedSection === 'model' && <ModelSettingsPage embedded />}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
