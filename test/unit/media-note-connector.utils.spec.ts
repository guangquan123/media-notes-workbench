import { getMediaNoteConnectorCopy } from '../../client/src/pages/MediaNotePage/media-note-connector.utils';

describe('media note connector UI copy', () => {
  it.each([
    ['feishu', '写入飞书'],
    ['dingtalk', '写入钉钉'],
  ] as const)(
    'uses the active %s connector publishing label',
    (connector, label) => {
      expect(getMediaNoteConnectorCopy(connector).publishingLabel).toBe(label);
    },
  );
});
