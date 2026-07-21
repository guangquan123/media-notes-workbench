import type { SourcePlatform } from '@shared/api.interface';

export type InboxMessageStatus =
  | 'DUPLICATE'
  | 'FAILED'
  | 'IGNORED'
  | 'PROCESSING'
  | 'QUEUED'
  | 'SUCCEEDED';

export interface InboxLinkClassification {
  readonly canonicalKey: string;
  readonly canonicalUrl: string;
  readonly platform: SourcePlatform;
}

export interface InboxSummaryInput {
  readonly status: InboxMessageStatus;
}

export interface InboxSummary {
  duplicates: number;
  failed: number;
  ignored: number;
  processing: number;
  queued: number;
  succeeded: number;
  totalMessages: number;
}

const TRACKING_PARAMETER_PREFIXES = ['from', 'share_', 'spm', 'utm_'];

function isTrackingParameter(key: string): boolean {
  const normalized = key.toLowerCase();
  return TRACKING_PARAMETER_PREFIXES.some((prefix: string) =>
    normalized.startsWith(prefix),
  );
}

function getPlatform(hostname: string): SourcePlatform | undefined {
  if (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com') || hostname === 'b23.tv') {
    return 'bilibili';
  }
  if (
    hostname === 'douyin.com' ||
    hostname.endsWith('.douyin.com') ||
    hostname === 'iesdouyin.com' ||
    hostname.endsWith('.iesdouyin.com')
  ) {
    return 'douyin';
  }
  return undefined;
}

function normalizeUrl(url: URL): string {
  const params: [string, string][] = Array.from(url.searchParams.entries())
    .filter(([key]: [string, string]) => !isTrackingParameter(key))
    .sort(([left]: [string, string], [right]: [string, string]) =>
      left.localeCompare(right),
    );
  url.search = '';
  for (const [key, value] of params) url.searchParams.append(key, value);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/u, '') || '/';
  return url.toString();
}

function getBilibiliMediaId(url: URL): string | undefined {
  const match = url.pathname.match(/\/(BV[0-9A-Za-z]+|av\d+)/iu);
  return match?.[1]?.toLowerCase();
}

function getDouyinMediaId(url: URL): string | undefined {
  const match = url.pathname.match(/\/video\/(\d+)/u);
  return match?.[1];
}

export function classifyInboxLink(rawUrl: string): InboxLinkClassification | undefined {
  try {
    const url = new URL(rawUrl);
    const platform = getPlatform(url.hostname.toLowerCase());
    if (!platform) return undefined;

    const canonicalUrl = normalizeUrl(url);
    const mediaId =
      platform === 'bilibili'
        ? getBilibiliMediaId(url)
        : getDouyinMediaId(url);
    const canonicalKey = mediaId
      ? `${platform}:${mediaId}`
      : `${platform}:url:${canonicalUrl.toLowerCase()}`;
    return { canonicalKey, canonicalUrl, platform };
  } catch {
    return undefined;
  }
}

export function buildInboxSubject(
  content: string,
  platform: SourcePlatform,
): string {
  const withoutUrl = content.replace(/https?:\/\/[^\s]+/gu, ' ').trim();
  const compact = withoutUrl.replace(/\s+/gu, ' ').slice(0, 120).trim();
  return compact || (platform === 'bilibili' ? 'B站视频链接' : '抖音视频链接');
}

export function summarizeInboxMessages(
  messages: readonly InboxSummaryInput[],
): InboxSummary {
  const summary: InboxSummary = {
    duplicates: 0,
    failed: 0,
    ignored: 0,
    processing: 0,
    queued: 0,
    succeeded: 0,
    totalMessages: 0,
  };
  for (const message of messages) {
    if (message.status !== 'IGNORED') summary.totalMessages += 1;
    switch (message.status) {
      case 'DUPLICATE':
        summary.duplicates += 1;
        break;
      case 'FAILED':
        summary.failed += 1;
        break;
      case 'IGNORED':
        summary.ignored += 1;
        break;
      case 'PROCESSING':
        summary.processing += 1;
        break;
      case 'QUEUED':
        summary.queued += 1;
        break;
      case 'SUCCEEDED':
        summary.succeeded += 1;
        break;
    }
  }
  return summary;
}
