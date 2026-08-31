import {
  ArrowLeft,
  FilePenLine,
  ListChecks,
  Cable,
  Layers3,
  HardDrive,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import NoteTemplatesPage from '@/pages/NoteTemplatesPage/NoteTemplatesPage';
import ConnectorSettingsPage from '@/pages/ConnectorSettingsPage/ConnectorSettingsPage';
import AiModelSettingsPage from '@/pages/AiModelSettingsPage/AiModelSettingsPage';
import MediaCleanupSettingsPage from '@/pages/MediaCleanupSettingsPage/MediaCleanupSettingsPage';
import SetupOverview from './SetupOverview';

type SettingsSection =
  | 'ai'
  | 'connectors'
  /** @deprecated 旧自检链接会映射到 ai。 */
  | 'model'
  | 'prompts'
  | 'setup'
  | 'storage'
  /** @deprecated 旧自检链接会映射到 ai。 */
  | 'transcription';

interface SettingsSectionOption {
  description: string;
  icon: typeof FilePenLine;
  label: string;
  value: SettingsSection;
}

const SETTINGS_SECTIONS: readonly SettingsSectionOption[] = [
  {
    value: 'setup',
    label: '开始使用',
    description: '自动检测环境并给出下一步。',
    icon: ListChecks,
  },
  {
    value: 'connectors',
    label: '连接器',
    description: '选择飞书或钉钉协作能力，并配置该连接器的通知。',
    icon: Cable,
  },
  {
    value: 'prompts',
    label: '提示词模板',
    description: '编辑、发布并对比笔记生成提示词。',
    icon: FilePenLine,
  },
  {
    value: 'ai',
    label: '模型服务与转录',
    description: '配置多个 API 提供者、能力模型和转录方式。',
    icon: Layers3,
  },
  {
    value: 'storage',
    label: '媒体清理',
    description: '盘点媒体占用，并配置定时或手工清理。',
    icon: HardDrive,
  },
];

function getSelectedSection(section: string | null): SettingsSection {
  if (
    section === 'ai' ||
    section === 'prompts' ||
    section === 'setup' ||
    section === 'connectors' ||
    section === 'storage'
  ) {
    return section;
  }
  if (section === 'model' || section === 'transcription') return 'ai';
  return 'setup';
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSection: SettingsSection = getSelectedSection(
    searchParams.get('section'),
  );
  const selectedSectionLabel =
    SETTINGS_SECTIONS.find((item) => item.value === selectedSection)?.label ||
    '开始使用';

  const selectSection = (section: SettingsSection): void => {
    setSearchParams({ section }, { replace: true });
  };

  return (
    <main className="min-h-screen overflow-auto bg-[#f6f7f5] text-[#161616]">
      <div className="min-h-screen bg-[radial-gradient(circle_at_84%_4%,rgba(77,93,255,0.1),transparent_25%),linear-gradient(135deg,rgba(17,19,21,0.025)_1px,transparent_1px)] bg-[size:auto,32px_32px]">
        <div className="mx-auto min-h-screen max-w-7xl px-5 md:px-8">
          <header className="sticky top-0 z-20 -mx-5 flex h-12 items-center justify-between gap-4 border-b border-black/8 bg-[#f6f7f5]/95 px-5 backdrop-blur md:-mx-8 md:px-8">
            <nav
              aria-label="面包屑"
              className="flex min-w-0 items-center gap-2 text-xs text-black/45"
            >
              <Link className="shrink-0 transition hover:text-black" to="/">
                工作台
              </Link>
              <span aria-hidden="true">/</span>
              <span className="shrink-0 text-black/70">参数配置</span>
              <span aria-hidden="true">/</span>
              <span className="truncate font-medium text-black/80">
                {selectedSectionLabel}
              </span>
            </nav>
            <Button
              asChild
              className="shrink-0 rounded-full bg-white/85 text-black/65 hover:bg-white hover:text-black"
              size="sm"
              variant="outline"
            >
              <Link to="/">
                <ArrowLeft className="size-3.5" />
                返回入口
              </Link>
            </Button>
          </header>

          <div className="grid gap-5 py-3 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-4">
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
                        <span className="text-sm font-semibold">
                          {item.label}
                        </span>
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
              {selectedSection === 'setup' && (
                <SetupOverview onSelectSection={selectSection} />
              )}
              {selectedSection === 'prompts' && <NoteTemplatesPage embedded />}
              {selectedSection === 'ai' && <AiModelSettingsPage embedded />}
              {selectedSection === 'connectors' && (
                <ConnectorSettingsPage embedded />
              )}
              {selectedSection === 'storage' && <MediaCleanupSettingsPage />}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
