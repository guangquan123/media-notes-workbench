import { useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  BookOpenText,
  CheckCircle2,
  CircleHelp,
  FileText,
  FileVideo,
  Link2,
  ScanSearch,
  Settings2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import './operation-manual-guide.css';

type SceneKey = 'video' | 'audio' | 'paired' | 'document' | 'platform';
type ManualMode = 'task' | 'config';

interface GuideStep {
  description: string;
  title: string;
}

interface SceneGuide {
  buttonLabel: string;
  cardHint: string;
  cardTitle: string;
  description: string;
  finish: string;
  icon: LucideIcon;
  label: string;
  mockDescription: string;
  mockTitle: string;
  name: string;
  steps: GuideStep[];
  summary: string;
  uploadLabel: string;
  workspace: string;
  input: 'single' | 'dual' | 'url';
}

const SCENE_GUIDES: Record<SceneKey, SceneGuide> = {
  video: {
    label: '本地视频指引',
    name: '本地视频',
    description: '课程 / 讲座 / 录屏',
    icon: FileVideo,
    summary: '适合课程、讲座和录屏。系统会提取声音、转成文字，再整理为笔记。',
    steps: [
      { title: '上传视频', description: '在右侧操作卡中拖入或选择本地视频。' },
      {
        title: '选择学习笔记',
        description: '需要保留 PPT 或图表时，再开启关键画面。',
      },
      { title: '点击开始生成', description: '等待转写、总结和写入全部完成。' },
    ],
    finish: '页面显示“笔记已经准备好”，并出现打开笔记按钮。',
    workspace: '本地视频工作台',
    mockTitle: '把本地视频，变成一篇有结构的学习笔记。',
    mockDescription: '上传课程、讲座或屏幕录制，系统会自动整理内容。',
    cardTitle: '选择视频文件',
    cardHint: '最多 10 个视频，累计不超过 10 GB',
    input: 'single',
    uploadLabel: '上传视频',
    buttonLabel: '开始生成学习笔记',
  },
  audio: {
    label: '录音文件指引',
    name: '录音文件',
    description: '课堂 / 访谈 / 备忘',
    icon: AudioLines,
    summary:
      '这里处理的是已有录音文件，不会调用麦克风。适合课堂、访谈和语音备忘。',
    steps: [
      { title: '上传录音文件', description: '选择 MP3、M4A、WAV 等已有文件。' },
      {
        title: '选择笔记风格',
        description: '学习笔记强调复习；会议纪要强调决策和待办。',
      },
      {
        title: '点击开始生成',
        description: '完成后重点核对数字、术语和行动项。',
      },
    ],
    finish: '页面显示“笔记已经准备好”，可以打开笔记或原始转写。',
    workspace: '录音整理工作台',
    mockTitle: '让一段录音，沉淀成真正可复习的笔记。',
    mockDescription: '上传课堂录音、访谈或语音备忘，系统会转写并整理。',
    cardTitle: '选择录音文件',
    cardHint: '支持 MP3、M4A、WAV、AAC、FLAC、OGG',
    input: 'single',
    uploadLabel: '上传录音文件',
    buttonLabel: '开始生成学习笔记',
  },
  paired: {
    label: '双源内容指引',
    name: '视频 + 录音',
    description: '同一场会议 / 培训',
    icon: ScanSearch,
    summary:
      '主视频提供画面，辅助录音补足声音。两份文件必须来自同一场会议或培训。',
    steps: [
      {
        title: '上传两份文件',
        description: '左侧放主视频，右侧放同场辅助录音。',
      },
      {
        title: '保持自动对齐',
        description: '只有明确知道起点偏差时，才使用手动偏移。',
      },
      {
        title: '开始交叉验证',
        description: '完成后核对画面、转写和差异提示。',
      },
    ],
    finish: '页面显示“双源笔记已经准备好”，可以打开融合笔记。',
    workspace: '双源会议 / 培训工作台',
    mockTitle: '把同一场内容的画面和声音，合成一份可核对的笔记。',
    mockDescription: '系统对齐两路声音，并结合视频关键画面生成融合时间线。',
    cardTitle: '选择双源文件',
    cardHint: '必须同时上传主视频和辅助录音',
    input: 'dual',
    uploadLabel: '上传两份文件',
    buttonLabel: '开始双源交叉验证',
  },
  document: {
    label: '文档资料指引',
    name: '文档资料',
    description: 'PDF / Word / PPT',
    icon: FileText,
    summary:
      '适合书籍、报告和课件。系统会读取原文、解析结构，再融合为一篇笔记。',
    steps: [
      {
        title: '上传文档',
        description: '可以一次选择多份 PDF、Word、PPT、TXT 或 Markdown。',
      },
      {
        title: '选择学习笔记',
        description: '系统会按主题融合内容，并保留原文入口。',
      },
      {
        title: '点击开始生成',
        description: '完成后核对引用、数字和跨文档结论。',
      },
    ],
    finish: '页面显示“笔记已经准备好”，可以打开知识笔记和原文。',
    workspace: '文档学习工作台',
    mockTitle: '把多份文档，沉淀成一篇可回顾的知识资产。',
    mockDescription: '上传书籍、报告、论文或课程资料，系统会解析并融合原文。',
    cardTitle: '选择文档文件',
    cardHint: '最多 10 个文档，累计不超过 200 MB',
    input: 'single',
    uploadLabel: '上传文档',
    buttonLabel: '开始生成学习笔记',
  },
  platform: {
    label: '平台视频指引',
    name: '平台链接',
    description: 'B 站 / 抖音',
    icon: Link2,
    summary:
      '适合 B 站或抖音中的课程和演讲。系统先读取链接，再完成转写和总结。',
    steps: [
      {
        title: '选择平台并粘贴链接',
        description: '使用完整的视频 URL，不要只复制编号。',
      },
      {
        title: '按提示处理权限',
        description: '受限视频出现提示时，再选择已登录的本机浏览器。',
      },
      {
        title: '点击开始生成',
        description: '查看当前处理阶段，不要重复提交同一链接。',
      },
    ],
    finish: '页面显示“笔记已经准备好”，可以打开笔记查看结果。',
    workspace: '平台视频学习工作台',
    mockTitle: '把平台视频，整理成可回看的学习笔记。',
    mockDescription: '粘贴 B 站或抖音链接，系统会拉取内容并生成笔记。',
    cardTitle: '输入视频链接',
    cardHint: '请选择平台并粘贴完整链接',
    input: 'url',
    uploadLabel: '粘贴链接',
    buttonLabel: '开始生成学习笔记',
  },
};

const MATERIALS: Array<{ key: SceneKey; label: string }> = [
  { key: 'video', label: '本地视频' },
  { key: 'audio', label: '录音文件' },
  { key: 'paired', label: '视频 + 录音' },
  { key: 'document', label: '文档资料' },
  { key: 'platform', label: '平台链接' },
];

const FAQS: Array<{ answer: string; question: string }> = [
  {
    question: '为什么按钮不能点击？',
    answer:
      '通常是还没有选择文件，或对应的处理能力尚未就绪。切换到“任务无法开始”可检查 3 项配置。',
  },
  {
    question: '上传完成后为什么还没出笔记？',
    answer:
      '上传只是第一步，还要等待转写、总结和写入。看到“笔记已经准备好”才算完成。',
  },
  {
    question: '录音文件和实时录音有什么区别？',
    answer:
      '录音文件页只处理已有音频文件，不调用麦克风；实时录音是另一条功能流程。',
  },
  {
    question: '生成的内容需要人工核对吗？',
    answer:
      '需要。尤其检查数字、术语、引用和行动项；原始转写会保留在转化记录中供回看。',
  },
];

const OperationManualPage = () => {
  const [mode, setMode] = useState<ManualMode>('task');
  const [sceneKey, setSceneKey] = useState<SceneKey>('video');
  const scene: SceneGuide = SCENE_GUIDES[sceneKey];

  return (
    <main className="manual-page">
      <header className="manual-topbar">
        <Link className="manual-brand" to="/">
          <span className="manual-brand__mark" aria-hidden="true">
            <BookOpenText className="size-4" />
          </span>
          <span>
            <strong>多媒体笔记工作台</strong>
            <small>新用户任务指引</small>
          </span>
        </Link>
        <div className="manual-topbar__state">
          <span aria-hidden="true" />
          选择素材，照着步骤完成
        </div>
        <Link className="manual-back" to="/">
          <ArrowLeft className="size-4" />
          返回入口
        </Link>
      </header>

      <div className="manual-page__inner">
        <section className="manual-intro">
          <div>
            <p className="manual-eyebrow">
              <span aria-hidden="true" />
              帮助中心 · 第一次使用
            </p>
            <h1>你手里有什么素材？</h1>
            <p>选择一种素材，我会告诉你进入页面后具体点哪里。</p>
          </div>
          <div className="manual-mode" aria-label="指引模式">
            <button
              className={mode === 'task' ? 'is-active' : ''}
              onClick={() => setMode('task')}
              type="button"
            >
              我要处理素材
            </button>
            <button
              className={mode === 'config' ? 'is-active' : ''}
              onClick={() => setMode('config')}
              type="button"
            >
              任务无法开始
            </button>
          </div>
        </section>

        {mode === 'task' ? (
          <>
            <section className="manual-chooser" aria-label="选择素材">
              <div className="manual-section-label">
                <strong>选择素材</strong>
                <span>一次只看一条指引</span>
              </div>
              <div className="manual-material-grid">
                {MATERIALS.map(
                  ({ key, label }: { key: SceneKey; label: string }) => {
                    const MaterialIcon: LucideIcon = SCENE_GUIDES[key].icon;
                    const isActive: boolean = sceneKey === key;
                    return (
                      <button
                        aria-pressed={isActive}
                        className={`manual-material${isActive ? ' is-active' : ''}`}
                        key={key}
                        onClick={() => setSceneKey(key)}
                        type="button"
                      >
                        <span className="manual-material__icon">
                          <MaterialIcon className="size-4" />
                        </span>
                        <span>
                          <strong>{label}</strong>
                          <small>{SCENE_GUIDES[key].description}</small>
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </section>

            <section
              className="manual-guide"
              aria-label={`${scene.name}操作指引`}
            >
              <article className="manual-guide__copy">
                <p className="manual-guide__label">
                  <span aria-hidden="true" />
                  {scene.label}
                </p>
                <h2>{scene.mockTitle.replace('。', '')}</h2>
                <p className="manual-guide__summary">{scene.summary}</p>
                <div className="manual-steps">
                  {scene.steps.map((step: GuideStep, index: number) => (
                    <div className="manual-step" key={step.title}>
                      <span
                        className={`manual-step__number${index === scene.steps.length - 1 ? ' is-finish' : ''}`}
                      >
                        {index + 1}
                      </span>
                      <div>
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="manual-finish">
                  <CheckCircle2 className="size-4" />
                  <span>
                    <strong>完成标志：</strong>
                    {scene.finish}
                  </span>
                </div>
              </article>

              <article className="manual-demo" aria-label="页面操作示意">
                <div className="manual-demo__bar">
                  <span>
                    <i aria-hidden="true">W</i>
                    {scene.workspace}
                  </span>
                  <span className="manual-demo__dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <div className="manual-demo__body">
                  <div className="manual-demo__copy">
                    <span>{scene.workspace}</span>
                    <h3>{scene.mockTitle}</h3>
                    <p>{scene.mockDescription}</p>
                    <div className="manual-demo__progress" aria-hidden="true">
                      <i className="is-active">1</i>
                      <i>2</i>
                      <i>3</i>
                      <i>4</i>
                      <i>5</i>
                    </div>
                  </div>
                  <div className="manual-mock-card">
                    <strong>{scene.cardTitle}</strong>
                    <small>{scene.cardHint}</small>
                    {scene.input === 'dual' ? (
                      <div className="manual-upload-grid">
                        <MockUpload label="主视频" hint="提供画面和视频音轨" />
                        <MockUpload label="辅助录音" hint="提供更清晰的声音" />
                      </div>
                    ) : scene.input === 'url' ? (
                      <div className="manual-url-input">
                        https://www.example.com/video/...
                      </div>
                    ) : (
                      <MockUpload
                        label="拖入文件，或点击选择"
                        hint={scene.cardHint}
                      />
                    )}
                    <span className="manual-mock-label">笔记风格</span>
                    <div className="manual-style-row">
                      <span className="is-active">学习笔记</span>
                      <span>会议纪要</span>
                    </div>
                    <div className="manual-mock-button">
                      {scene.buttonLabel}
                    </div>
                    <Callout
                      number="1"
                      label={scene.uploadLabel}
                      position="upload"
                    />
                    <Callout number="2" label="选择风格" position="style" />
                    <Callout
                      number="3"
                      label={scene.input === 'dual' ? '开始验证' : '开始生成'}
                      position="submit"
                    />
                  </div>
                </div>
              </article>
            </section>
          </>
        ) : (
          <section className="manual-config" aria-label="任务配置检查">
            <article className="manual-config__intro">
              <p className="manual-guide__label">
                <span aria-hidden="true" />
                配置检查
              </p>
              <h2>任务无法开始时，只检查这 3 项</h2>
              <p>
                不用理解全部参数。页面按钮无法点击或提示“需要配置”时，再按右侧顺序检查。
              </p>
              <div className="manual-config__tip">
                <strong>先做什么：</strong>进入“参数配置 →
                开始使用”，运行一次自动检测。系统会直接告诉你缺少哪一项。
              </div>
              <Link className="manual-config__link" to="/settings">
                <Settings2 className="size-4" />
                打开参数配置
              </Link>
            </article>
            <article className="manual-checklist">
              <h3>按顺序检查</h3>
              {[
                [
                  '处理能力是否就绪',
                  '文档、音视频或平台链接对应能力应显示“已就绪”。',
                ],
                [
                  '转录与总结模型是否可用',
                  '音视频需要转录能力；所有任务都需要总结模型。',
                ],
                [
                  '笔记输出位置是否有效',
                  '确认当前启用的飞书或钉钉连接器可以写入。',
                ],
              ].map(([title, description]: [string, string], index: number) => (
                <div className="manual-check" key={title}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </div>
                  <em>第 {index + 1} 步</em>
                </div>
              ))}
            </article>
          </section>
        )}

        {mode === 'config' && (
          <section className="manual-faq" aria-labelledby="manual-faq-title">
            <div className="manual-faq__header">
              <div className="manual-faq__heading">
                <span className="manual-faq__badge">
                  <CircleHelp className="size-5" />
                </span>
                <span>
                  <strong id="manual-faq-title">遇到问题？先看这里</strong>
                  <small>大多数卡点都可以在下面找到答案</small>
                </span>
              </div>
              <span className="manual-faq__flag">新用户高频问题</span>
            </div>
            <div className="manual-faq__list">
              {FAQS.map(
                ({
                  answer,
                  question,
                }: {
                  answer: string;
                  question: string;
                }) => (
                  <details
                    className="manual-faq__item"
                    key={question}
                    open={question === FAQS[0].question}
                  >
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ),
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
};

interface MockUploadProps {
  hint: string;
  label: string;
}
const MockUpload = ({ hint, label }: MockUploadProps) => (
  <div className="manual-upload">
    <span>
      <Upload className="size-4" />
    </span>
    <strong>{label}</strong>
    <small>{hint}</small>
  </div>
);

interface CalloutProps {
  label: string;
  number: string;
  position: 'submit' | 'style' | 'upload';
}
const Callout = ({ label, number, position }: CalloutProps) => (
  <span className={`manual-callout is-${position}`}>
    <b>{number}</b>
    <span>{label}</span>
  </span>
);

export default OperationManualPage;
