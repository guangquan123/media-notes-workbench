import {
  buildReturnTo,
  getSafeReturnTo,
  hasSafeReturnTo,
} from '../../client/src/lib/navigation-return';

describe('navigation return helpers', () => {
  it('keeps an internal path with query and hash', () => {
    expect(
      buildReturnTo({
        hash: '#upload',
        pathname: '/audio-notes',
        search: '?draft=1',
      }),
    ).toBe('/audio-notes?draft=1#upload');
  });

  it('rejects external and protocol-relative paths', () => {
    expect(getSafeReturnTo('https://example.com')).toBe('/');
    expect(getSafeReturnTo('//example.com')).toBe('/');
    expect(getSafeReturnTo('/\\evil.com')).toBe('/');
    expect(hasSafeReturnTo('javascript:alert(1)')).toBe(false);
  });

  it('accepts valid internal paths', () => {
    expect(getSafeReturnTo('/recording-notes?draft=1#review')).toBe(
      '/recording-notes?draft=1#review',
    );
    expect(hasSafeReturnTo('/audio-notes')).toBe(true);
  });
});
