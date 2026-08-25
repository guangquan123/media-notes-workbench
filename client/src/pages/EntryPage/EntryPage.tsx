import {
  ArrowRight,
  BookOpenText,
  FileAudio,
  FileText,
  FileVideo,
  History,
  ScanSearch,
  Settings2,
  type LucideIcon,
  Waypoints,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface FeatureCard {
  badge: string;
  bullets: readonly string[];
  cta: string;
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}

const FEATURE_CARDS: readonly FeatureCard[] = [
  {
    href: '/paired-media-notes',
    icon: ScanSearch,
    title: '双源会议 / 培训笔记',
    description: '同时上传视频和录音，用画面与语音交叉验证内容。',
    badge: '视频 + 录音',
    bullets: ['时间对齐', '关键画面', '冲突标记'],
    cta: '上传双文件',
  },
  {
    href: '/video-notes',
    icon: BookOpenText,
    title: '视频学习笔记',
    description: '粘贴 B站或抖音链接，自动提炼重点并写成可复习的笔记。',
    badge: '最常用',
    bullets: ['自动转录', '结构化总结', '飞书归档'],
    cta: '开始处理视频',
  },
  {
    href: '/local-video-notes',
    icon: FileVideo,
    title: '本地视频',
    description: '课程、讲座或屏幕录制，都可以直接上传处理。',
    badge: '视频文件',
    bullets: ['文件上传', '音轨提取', '处理进度'],
    cta: '上传视频',
  },
  {
    href: '/audio-notes',
    icon: FileAudio,
    title: '录音笔记',
    description: '把课堂录音、访谈和语音备忘变成行动清单。',
    badge: '录音文件',
    bullets: ['多种格式', '自动切片', '行动项'],
    cta: '上传录音',
  },
  {
    href: '/document-notes',
    icon: FileText,
    title: '文档笔记',
    description: '上传书籍、报告或课件，融合沉淀知识结构。',
    badge: '文档文件',
    bullets: ['多文件融合', '原文解析', '飞书归档'],
    cta: '上传文档',
  },
];

interface FeatureCardItemProps {
  featured?: boolean;
  item: FeatureCard;
}

function FeatureCardItem({
  featured = false,
  item,
}: FeatureCardItemProps) {
  const Icon: LucideIcon = item.icon;
  return (
    <Link
      aria-label={`${item.title}：${item.cta}`}
      className={`entry-card ${featured ? 'entry-card--featured' : ''}`}
      to={item.href}
    >
      <div className="entry-card__topline">
        <span className="entry-card__badge">
          <Icon aria-hidden="true" className="size-3.5" />
          {item.badge}
        </span>
        <span className="entry-card__icon" aria-hidden="true">
          <Icon className="size-5" />
        </span>
      </div>
      <div className="entry-card__body">
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        <div className="entry-card__bullets">
          {item.bullets.map((bullet: string) => (
            <span key={bullet}>{bullet}</span>
          ))}
        </div>
      </div>
      <span className="entry-card__cta">
        {item.cta}
        <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </Link>
  );
}

export default function EntryPage() {
  const primaryCard: FeatureCard = FEATURE_CARDS[1];
  const secondaryCards: readonly FeatureCard[] = [
    FEATURE_CARDS[0],
    FEATURE_CARDS[2],
    FEATURE_CARDS[3],
    FEATURE_CARDS[4],
  ];

  return (
    <main className="entry-page">
      <div className="entry-page__inner">
        <header className="entry-header">
          <Link className="entry-brand" to="/">
            <span className="entry-brand__mark" aria-hidden="true">
              <Waypoints className="size-5" />
            </span>
            <span>
              <strong>多媒体笔记工作台</strong>
              <small>把资料整理成可复用的知识</small>
            </span>
          </Link>
          <nav aria-label="工作台辅助导航" className="entry-nav">
            <Link to="/conversion-history">
              <History className="size-4" />
              转化记录
            </Link>
            <Link to="/operation-manual">
              <BookOpenText className="size-4" />
              操作手册
            </Link>
            <Link className="entry-nav__primary" to="/settings">
              <Settings2 className="size-4" />
              参数配置
            </Link>
          </nav>
        </header>

        <section className="entry-intro">
          <div>
            <p className="entry-eyebrow">从素材开始，留下知识轨迹</p>
            <h1>你想先整理哪一种内容？</h1>
            <p className="entry-intro__copy">
              选择一个入口，系统会负责转录、提炼、结构化和归档。处理过程都在本机完成，结果可回到原文核对。
            </p>
          </div>
        </section>

        <section className="entry-workspace" aria-label="素材入口">
          <FeatureCardItem featured item={primaryCard} />
          <div className="entry-secondary-grid">
            {secondaryCards.map((item: FeatureCard) => (
              <FeatureCardItem item={item} key={item.href} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
