import {
  getMediaNoteConnectorCopy,
  toMarkdownFileName,
} from '../../client/src/pages/MediaNotePage/media-note-connector.utils';

describe('media note connector UI copy', () => {
  it.each([
    ['local', '保存 Markdown 文件'],
    ['feishu', '写入飞书'],
    ['dingtalk', '写入钉钉'],
  ] as const)(
    'uses the active %s connector publishing label',
    (connector, label) => {
      expect(getMediaNoteConnectorCopy(connector).publishingLabel).toBe(label);
    },
  );

  it('builds a portable Markdown export name', () => {
    expect(toMarkdownFileName('课程：第一讲.mp4')).toBe(
      '课程：第一讲-学习笔记.md',
    );
    expect(toMarkdownFileName('')).toBe('学习笔记-学习笔记.md');
  });
});
