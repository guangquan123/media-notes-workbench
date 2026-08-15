const {
  resolveBackendProxyPath,
}: {
  resolveBackendProxyPath: (
    requestUrl: string,
    configuredBasePath?: string,
  ) => string;
} = require('../../scripts/static-client.js');

describe('static client backend proxy path', () => {
  it('removes the application base path before forwarding to Nest', () => {
    expect(
      resolveBackendProxyPath(
        '/app/app_abc/api/runtime?refresh=1',
        '/app/app_abc',
      ),
    ).toBe('/api/runtime?refresh=1');
  });

  it('keeps root deployments and unrelated paths unchanged', () => {
    expect(resolveBackendProxyPath('/api/runtime', '/')).toBe('/api/runtime');
    expect(
      resolveBackendProxyPath('/app/app_abc/assets/index.js', '/app/app_abc'),
    ).toBe('/app/app_abc/assets/index.js');
  });
});
