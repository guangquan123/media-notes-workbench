import {
  extractSupportedPlatformUrl,
  isValidInboxChatId,
} from '../../server/modules/note-inbox/note-inbox.utils';

describe('note inbox URL extraction', () => {
  it('extracts a Douyin short link from a share message', () => {
    const url = extractSupportedPlatformUrl(
      '复制此链接，打开抖音搜索，直接观看视频！ https://v.douyin.com/abc123/ 02/01',
    );

    expect(url).toBe('https://v.douyin.com/abc123/');
  });

  it('removes Chinese closing punctuation from a Bilibili link', () => {
    const url = extractSupportedPlatformUrl(
      '稍后看这个：https://www.bilibili.com/video/BV1xx411c7mD/。',
    );

    expect(url).toBe('https://www.bilibili.com/video/BV1xx411c7mD/');
  });

  it('ignores an unsupported URL', () => {
    const url = extractSupportedPlatformUrl('https://example.com/video/123');

    expect(url).toBeUndefined();
  });

  it('accepts only Feishu chat identifiers', () => {
    expect(isValidInboxChatId('oc_abcdef123')).toBe(true);
    expect(isValidInboxChatId('chat-123')).toBe(false);
  });
});
