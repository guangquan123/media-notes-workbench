const {
  extractEntryResources,
  isApplicationReady,
  isRuntimeStatusReady,
}: {
  extractEntryResources: (
    response: { status: number; contentType: string; body: string },
    pageUrl: string,
  ) => Array<{ kind: 'script' | 'stylesheet'; url: string }>;
  isApplicationReady: (input: {
    pageUrl: string;
    runtimeUrl: string;
    request: (url: string) => Promise<{ status: number; contentType: string; body: string }>;
  }) => Promise<boolean>;
  isRuntimeStatusReady: (response: {
    status: number;
    contentType: string;
    body: string;
  }) => boolean;
} = require('../../scripts/application-readiness.js');

const pageUrl = 'http://127.0.0.1:8081/app/app_demo/';
const runtimeUrl = 'http://127.0.0.1:3000/app/app_demo/api/runtime';
const runtime = {
  mode: 'local',
  label: '本地',
  auth: 'local',
  database: 'local',
  ai: 'external',
  storage: 'local',
  ready: true,
};
const page = `<!doctype html><div id="root"></div><link rel="stylesheet" href="/app/app_demo/assets/index.css"><script type="module" src="/app/app_demo/assets/index.js"></script>`;

describe('Windows application readiness', () => {
  it('rejects runtime responses that are not the expected ready JSON payload', () => {
    expect(isRuntimeStatusReady({ status: 401, contentType: 'application/json', body: JSON.stringify(runtime) })).toBe(false);
    expect(isRuntimeStatusReady({ status: 200, contentType: 'application/json', body: '{not-json}' })).toBe(false);
    expect(isRuntimeStatusReady({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...runtime, ready: false }) })).toBe(false);
  });

  it('requires the actual module entry and stylesheet to load successfully', async () => {
    const responses = new Map([
      [pageUrl, { status: 200, contentType: 'text/html', body: page }],
      [runtimeUrl, { status: 200, contentType: 'application/json', body: JSON.stringify(runtime) }],
      ['http://127.0.0.1:8081/app/app_demo/assets/index.js', { status: 404, contentType: 'text/html', body: '' }],
      ['http://127.0.0.1:8081/app/app_demo/assets/index.css', { status: 200, contentType: 'text/css', body: '' }],
    ]);

    await expect(isApplicationReady({ pageUrl, runtimeUrl, request: async (url) => responses.get(url) ?? { status: 0, contentType: '', body: '' } })).resolves.toBe(false);
  });

  it('accepts a complete page, entry resources, and ready runtime response', async () => {
    expect(extractEntryResources({ status: 200, contentType: 'text/html', body: page }, pageUrl)).toEqual([
      { kind: 'script', url: 'http://127.0.0.1:8081/app/app_demo/assets/index.js' },
      { kind: 'stylesheet', url: 'http://127.0.0.1:8081/app/app_demo/assets/index.css' },
    ]);

    const responses = new Map([
      [pageUrl, { status: 200, contentType: 'text/html', body: page }],
      [runtimeUrl, { status: 200, contentType: 'application/json', body: JSON.stringify(runtime) }],
      ['http://127.0.0.1:8081/app/app_demo/assets/index.js', { status: 200, contentType: 'text/javascript', body: '' }],
      ['http://127.0.0.1:8081/app/app_demo/assets/index.css', { status: 200, contentType: 'text/css; charset=utf-8', body: '' }],
    ]);

    await expect(isApplicationReady({ pageUrl, runtimeUrl, request: async (url) => responses.get(url) ?? { status: 0, contentType: '', body: '' } })).resolves.toBe(true);
  });
});
