import { resolveByteRange } from '../../server/modules/local-uploads/local-uploads.utils';

describe('resolveByteRange', () => {
  it('resolves an explicit byte range', () => {
    expect(resolveByteRange('bytes=100-199', 1_000)).toEqual({
      end: 199,
      start: 100,
    });
  });

  it('resolves an open-ended byte range', () => {
    expect(resolveByteRange('bytes=900-', 1_000)).toEqual({
      end: 999,
      start: 900,
    });
  });

  it('resolves a suffix byte range', () => {
    expect(resolveByteRange('bytes=-100', 1_000)).toEqual({
      end: 999,
      start: 900,
    });
  });

  it.each(['bytes=1000-', 'bytes=200-100', 'bytes=-0', 'bytes=0-1,3-4'])(
    'rejects an invalid or unsupported range: %s',
    (range: string) => {
      expect(resolveByteRange(range, 1_000)).toBeNull();
    },
  );
});
