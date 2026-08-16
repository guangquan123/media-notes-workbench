import { get } from 'node:http';

const { resolveBackendProxyPath }: {
  resolveBackendProxyPath: (
    requestUrl: string,
    configuredBasePath?: string,
  ) => string;
} = require('../../scripts/static-client.js');

describe('static client backend proxy path', () => {
  it('preserves the application base path when forwarding to the local host', () => {
    expect(
      resolveBackendProxyPath(
        '/app/app_abc/api/runtime?refresh=1',
        '/app/app_abc',
      ),
    ).toBe('/app/app_abc/api/runtime?refresh=1');
  });

  it('keeps root deployments and unrelated paths unchanged', () => {
    expect(resolveBackendProxyPath('/api/runtime', '/')).toBe('/api/runtime');
    expect(
      resolveBackendProxyPath('/app/app_abc/assets/index.js', '/app/app_abc'),
    ).toBe('/app/app_abc/assets/index.js');
  });

  it('confirms that the listener belongs to the current static fallback instance', async () => {
    const originalPort = process.env.CLIENT_DEV_PORT;
    const originalToken = process.env.STATIC_CLIENT_INSTANCE_TOKEN;
    process.env.CLIENT_DEV_PORT = '0';
    process.env.STATIC_CLIENT_INSTANCE_TOKEN = 'test-static-instance';

    let start: () => { ready: Promise<unknown>; close: (callback: () => void) => void; address: () => { port: number } | string | null };
    jest.isolateModules(() => {
      ({ start } = require('../../scripts/static-client.js'));
    });

    const server = start();
    await server.ready;
    const address = server.address();
    expect(address).not.toBeNull();
    expect(typeof address).not.toBe('string');
    const port = (address as { port: number }).port;

    const response = await new Promise<{ status: number; token: string }>((resolve, reject) => {
      const request = get(
        `http://127.0.0.1:${port}/app/app_179bn4jet6k/`,
        (result) => {
          result.resume();
          result.on('end', () =>
            resolve({
              status: result.statusCode || 0,
              token: String(result.headers['x-media-notes-static-client'] || ''),
            }),
          );
        },
      );
      request.once('error', reject);
    });
    expect(response).toEqual({ status: 200, token: 'test-static-instance' });

    await new Promise<void>((resolve) => server.close(resolve));
    if (originalPort === undefined) delete process.env.CLIENT_DEV_PORT;
    else process.env.CLIENT_DEV_PORT = originalPort;
    if (originalToken === undefined) delete process.env.STATIC_CLIENT_INSTANCE_TOKEN;
    else process.env.STATIC_CLIENT_INSTANCE_TOKEN = originalToken;
  });
});
