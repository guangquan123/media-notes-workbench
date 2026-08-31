const {
  extractEntryResources,
  inspectApplicationReadiness,
  isApplicationReady,
  isRuntimeStatusReady,
  isSystemReadinessReady,
}: {
  extractEntryResources: (
    response: { status: number; contentType: string; body: string },
    pageUrl: string,
  ) => Array<{ kind: 'script' | 'stylesheet'; url: string }>;
  inspectApplicationReadiness: (input: {
    pageUrl: string;
    readinessUrl: string;
    runtimeUrl: string;
    request: (url: string) => Promise<HttpResponse>;
  }) => Promise<{ ready: boolean; reason: string }>;
  isApplicationReady: (input: {
    pageUrl: string;
    readinessUrl: string;
    runtimeUrl: string;
    request: (url: string) => Promise<HttpResponse>;
  }) => Promise<boolean>;
  isRuntimeStatusReady: (response: {
    status: number;
    contentType: string;
    body: string;
  }) => boolean;
  isSystemReadinessReady: (response: HttpResponse) => boolean;
} = require('../../scripts/application-readiness.js');

interface HttpResponse {
  body: string;
  contentType: string;
  status: number;
}

const pageUrl = 'http://127.0.0.1:8081/app/app_demo/';
const runtimeUrl = 'http://127.0.0.1:3000/app/app_demo/api/runtime';
const readinessUrl =
  'http://127.0.0.1:3000/app/app_demo/api/note-jobs/readiness';
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
const readiness = {
  documentReady: false,
  ffmpeg: false,
  larkCli: false,
  mediaReady: false,
  pdfReady: false,
  platformReady: false,
  ready: false,
  tencentAsr: false,
  tencentAsrEnabled: false,
  whisperCli: false,
  whisperModel: false,
  ytDlp: false,
};

describe('Windows application readiness', () => {
  it('rejects runtime responses that are not the expected ready JSON payload', () => {
    expect(
      isRuntimeStatusReady({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify(runtime),
      }),
    ).toBe(false);
    expect(
      isRuntimeStatusReady({
        status: 200,
        contentType: 'application/json',
        body: '{not-json}',
      }),
    ).toBe(false);
    expect(
      isRuntimeStatusReady({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...runtime, ready: false }),
      }),
    ).toBe(false);
  });

  it('accepts a valid environment report even when optional capabilities are unavailable', () => {
    expect(
      isSystemReadinessReady({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(readiness),
      }),
    ).toBe(true);
    expect(
      isSystemReadinessReady({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify(readiness),
      }),
    ).toBe(false);
    expect(
      isSystemReadinessReady({
        status: 200,
        contentType: 'text/html',
        body: JSON.stringify(readiness),
      }),
    ).toBe(false);
  });

  it('reports the business readiness endpoint as the startup blocker', async () => {
    const responses = new Map<string, HttpResponse>([
      [pageUrl, { status: 200, contentType: 'text/html', body: page }],
      [
        runtimeUrl,
        {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(runtime),
        },
      ],
      [
        readinessUrl,
        {
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'environment probe failed' }),
        },
      ],
    ]);

    await expect(
      inspectApplicationReadiness({
        pageUrl,
        readinessUrl,
        runtimeUrl,
        request: async (url: string) =>
          responses.get(url) ?? {
            status: 0,
            contentType: '',
            body: '',
          },
      }),
    ).resolves.toEqual({
      ready: false,
      reason: '核心环境检测接口未返回有效响应（HTTP 500）',
    });
  });

  it('requires the actual module entry and stylesheet to load successfully', async () => {
    const responses = new Map([
      [pageUrl, { status: 200, contentType: 'text/html', body: page }],
      [
        runtimeUrl,
        {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(runtime),
        },
      ],
      [
        readinessUrl,
        {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(readiness),
        },
      ],
      [
        'http://127.0.0.1:8081/app/app_demo/assets/index.js',
        { status: 404, contentType: 'text/html', body: '' },
      ],
      [
        'http://127.0.0.1:8081/app/app_demo/assets/index.css',
        { status: 200, contentType: 'text/css', body: '' },
      ],
    ]);

    await expect(
      isApplicationReady({
        pageUrl,
        readinessUrl,
        runtimeUrl,
        request: async (url) =>
          responses.get(url) ?? { status: 0, contentType: '', body: '' },
      }),
    ).resolves.toBe(false);
  });

  it('accepts a complete page, entry resources, and ready runtime response', async () => {
    expect(
      extractEntryResources(
        { status: 200, contentType: 'text/html', body: page },
        pageUrl,
      ),
    ).toEqual([
      {
        kind: 'script',
        url: 'http://127.0.0.1:8081/app/app_demo/assets/index.js',
      },
      {
        kind: 'stylesheet',
        url: 'http://127.0.0.1:8081/app/app_demo/assets/index.css',
      },
    ]);

    const responses = new Map([
      [pageUrl, { status: 200, contentType: 'text/html', body: page }],
      [
        runtimeUrl,
        {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(runtime),
        },
      ],
      [
        readinessUrl,
        {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(readiness),
        },
      ],
      [
        'http://127.0.0.1:8081/app/app_demo/assets/index.js',
        { status: 200, contentType: 'text/javascript', body: '' },
      ],
      [
        'http://127.0.0.1:8081/app/app_demo/assets/index.css',
        { status: 200, contentType: 'text/css; charset=utf-8', body: '' },
      ],
    ]);

    await expect(
      isApplicationReady({
        pageUrl,
        readinessUrl,
        runtimeUrl,
        request: async (url) =>
          responses.get(url) ?? { status: 0, contentType: '', body: '' },
      }),
    ).resolves.toBe(true);
  });
});
