import {
  resolveLocalBackendBasePath,
  resolveLocalBackendRequestPath,
} from '../../client/src/lib/local-http';

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

describe('local HTTP request path', () => {
  it.each([
    ['/', '/api/local-uploads', '/api/local-uploads'],
    ['/settings', 'api/local-uploads', '/api/local-uploads'],
    [
      '/app/app_abc/document-notes',
      '/api/local-uploads',
      '/app/app_abc/api/local-uploads',
    ],
  ])('resolves %s and %s to %s', (pathname, requestPath, expected) => {
    expect(resolveLocalBackendRequestPath(pathname, requestPath)).toBe(
      expected,
    );
  });
});
