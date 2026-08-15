import { resolveLocalBackendBasePath } from '../../client/src/lib/local-http';

describe('local HTTP base path', () => {
  it.each([
    ['/', undefined],
    ['/settings', undefined],
    ['/app/app_abc/settings', '/app/app_abc'],
    ['/app/app_abc/api/runtime', '/app/app_abc'],
  ])('resolves %s to %s', (pathname, expected) => {
    expect(resolveLocalBackendBasePath(pathname)).toBe(expected);
  });
});
