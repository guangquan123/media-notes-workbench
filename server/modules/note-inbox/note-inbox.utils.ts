import type { SourcePlatform } from '@shared/api.interface';

const TRAILING_SHARE_PUNCTUATION = /[),.，。！？!）】》〉]+$/u;

const PLATFORM_HOSTS: Record<SourcePlatform, readonly string[]> = {
  bilibili: ['bilibili.com', 'b23.tv'],
  douyin: ['douyin.com', 'iesdouyin.com', 'v.douyin.com'],
};

export interface InboxMessage {
  readonly content: string;
  readonly messageId: string;
}

function isSupportedUrl(candidate: string): boolean {
  try {
    const hostname = new URL(candidate).hostname.toLowerCase();
    return Object.values(PLATFORM_HOSTS).some((hosts: readonly string[]) =>
      hosts.some(
        (host: string) => hostname === host || hostname.endsWith(`.${host}`),
      ),
    );
  } catch {
    return false;
  }
}

export function extractSupportedPlatformUrl(content: string): string | undefined {
  const candidates: string[] = content.match(/https?:\/\/[^\s]+/gu) || [];
  return candidates
    .map((candidate: string) => candidate.replace(TRAILING_SHARE_PUNCTUATION, ''))
    .find((candidate: string) => isSupportedUrl(candidate));
}

export function isValidInboxChatId(chatId: string): boolean {
  return /^oc_[A-Za-z0-9]+$/u.test(chatId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseInboxMessages(payload: unknown): InboxMessage[] {
  if (!isRecord(payload)) return [];
  const messageContainer = isRecord(payload.data) ? payload.data : payload;
  if (!Array.isArray(messageContainer.messages)) return [];
  return messageContainer.messages.flatMap((item: unknown): InboxMessage[] => {
    if (!isRecord(item)) return [];
    const messageId = item.message_id;
    const content = item.content;
    if (typeof messageId !== 'string' || typeof content !== 'string') return [];
    return [{ content, messageId }];
  });
}
