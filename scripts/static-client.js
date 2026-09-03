#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const clientRoot = path.join(rootDir, 'dist', 'client');
const assetRoot = path.join(clientRoot, 'assets');
const host = process.env.CLIENT_DEV_HOST || '127.0.0.1';
const port = Number(process.env.CLIENT_DEV_PORT || 8081);
const serverHost = process.env.SERVER_HOST || '127.0.0.1';
const serverPort = Number(process.env.SERVER_PORT || 3001);
const basePath =
  `${process.env.CLIENT_BASE_PATH || '/app/app_179bn4jet6k'}`.replace(
    /\/+$/,
    '',
  ) || '/';
const indexFile = path.join(clientRoot, 'static-fallback-index.html');
const backendTarget = new URL(`http://${serverHost}:${serverPort}`);
const localDevUtils = require(
  path.join(
    rootDir,
    'node_modules',
    '@lark-apaas',
    'fullstack-vite-preset',
    'lib',
    'utils',
    'local-dev.js',
  ),
);
const sandboxOrigin = localDevUtils.resolveSandboxOrigin();
const runtimeTarget = sandboxOrigin ? new URL(sandboxOrigin) : null;
const instanceToken = process.env.STATIC_CLIENT_INSTANCE_TOKEN || '';

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.webmanifest': 'application/manifest+json',
    }[extension] || 'application/octet-stream'
  );
}

function safeJoin(root, relativePath) {
  const candidate = path.resolve(root, relativePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`)
    ? candidate
    : null;
}

function resolveStaticRequest(requestRelativePath) {
  const assetPrefix = '/assets/';
  const isAsset = requestRelativePath.startsWith(assetPrefix);
  const relativePath = isAsset
    ? requestRelativePath.slice(assetPrefix.length)
    : requestRelativePath.replace(/^\/+/, '');
  return {
    filePath: safeJoin(isAsset ? assetRoot : clientRoot, relativePath),
    isAsset,
  };
}

function isPlatformRuntimePath(pathname) {
  const runtimeBasePath = `${basePath === '/' ? '' : basePath}/__runtime__`;
  return (
    pathname === runtimeBasePath || pathname.startsWith(`${runtimeBasePath}/`)
  );
}

function resolveBackendProxyPath(requestUrl, configuredBasePath = basePath) {
  // Vite 的本地代理会移除浏览器使用的 /app/app_xxx 前缀，后端路由从
  // /api/... 开始。静态兜底服务必须使用相同规则，否则 /api/runtime 会落到
  // 后端的前端页面路由并返回 500，导致启动器一直等待页面渲染确认。
  const normalizedBasePath =
    `${configuredBasePath || '/'}`.replace(/\/+$/, '') || '/';
  if (normalizedBasePath === '/') return requestUrl;
  const apiPrefix = `${normalizedBasePath}/api/`;
  return requestUrl.startsWith(apiPrefix)
    ? requestUrl.slice(normalizedBasePath.length)
    : requestUrl;
}

function buildFallbackIndex() {
  const assetFiles = fs
    .readdirSync(assetRoot)
    .filter((fileName) => /^index-[^/]+\.js$/.test(fileName))
    .map((fileName) => ({
      fileName,
      mtime: fs.statSync(path.join(assetRoot, fileName)).mtimeMs,
    }))
    .sort((left, right) => right.mtime - left.mtime);
  const cssFiles = fs
    .readdirSync(assetRoot)
    .filter((fileName) => /^index-[^/]+\.css$/.test(fileName))
    .map((fileName) => ({
      fileName,
      mtime: fs.statSync(path.join(assetRoot, fileName)).mtimeMs,
    }))
    .sort((left, right) => right.mtime - left.mtime);
  if (assetFiles.length === 0 || cssFiles.length === 0) {
    throw new Error(`缺少静态前端构建资源: ${assetRoot}`);
  }
  const html = `<!doctype html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="media-notes-static-fallback" content="1" />
    <title>多媒体笔记工作台</title>
    <link rel="icon" href="${basePath}/favicon.svg?v=5" type="image/svg+xml" />
    <link rel="stylesheet" href="${basePath}/assets/${cssFiles[0].fileName}" />
    <script>window.__BASENAME__=${JSON.stringify(basePath)};</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${basePath}/assets/${assetFiles[0].fileName}"></script>
  </body>
</html>
`;
  fs.writeFileSync(indexFile, html, 'utf8');
  return html;
}

function getRuntimeProxyHeaders() {
  const { cookie, csrfToken } = localDevUtils.composeSandboxOutboundAuth();
  const webUser = localDevUtils.parseSudaWebUserEnv(process.env.SUDA_WEBUSER);
  return {
    'accept-encoding': 'identity',
    ...(cookie ? { cookie } : {}),
    ...(csrfToken ? { 'x-suda-csrf-token': csrfToken } : {}),
    ...(webUser
      ? { 'x-larkgw-suda-webuser': encodeURIComponent(JSON.stringify(webUser)) }
      : {}),
  };
}

function getBackendProxyHeaders(request) {
  const { cookie, csrfToken } = localDevUtils.composeSandboxOutboundAuth();
  const webUser = localDevUtils.parseSudaWebUserEnv(process.env.SUDA_WEBUSER);
  const incomingCookie = request.headers.cookie || '';
  const cookieCsrf = /(?:^|;\s*)suda-csrf-token=([^;]+)/.exec(
    incomingCookie,
  )?.[1];
  const outboundCookie = cookieCsrf
    ? incomingCookie
    : [incomingCookie, cookie].filter(Boolean).join('; ');
  return {
    ...(outboundCookie ? { cookie: outboundCookie } : {}),
    ...(webUser
      ? { 'x-larkgw-suda-webuser': encodeURIComponent(JSON.stringify(webUser)) }
      : {}),
    ...(cookieCsrf || csrfToken
      ? { 'x-suda-csrf-token': cookieCsrf || csrfToken }
      : {}),
  };
}

function proxyRequest(
  request,
  response,
  target,
  extraHeaders = {},
  requestPath = request.url,
) {
  const transport = target.protocol === 'https:' ? https : http;
  const proxy = transport.request(
    {
      hostname: target.hostname,
      port: target.port || undefined,
      path: requestPath,
      method: request.method,
      headers: { ...request.headers, ...extraHeaders, host: target.host },
    },
    (upstream) => {
      response.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(response);
    },
  );
  proxy.on('error', (error) => {
    if (!response.headersSent) {
      response.writeHead(502, {
        'content-type': 'application/json; charset=utf-8',
      });
    }
    response.end(
      JSON.stringify({
        code: 'BACKEND_UNAVAILABLE',
        message: `后端暂不可用: ${error.message}`,
      }),
    );
  });
  request.pipe(proxy);
}

function start() {
  if (!fs.existsSync(clientRoot)) {
    throw new Error(`缺少静态前端目录: ${clientRoot}`);
  }
  const indexHtml = buildFallbackIndex();
  const server = http.createServer((request, response) => {
    if (instanceToken) {
      response.setHeader('x-media-notes-static-client', instanceToken);
    }
    const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
    if (isPlatformRuntimePath(requestUrl.pathname)) {
      if (!runtimeTarget) {
        response.writeHead(502, {
          'content-type': 'application/json; charset=utf-8',
        });
        response.end(
          JSON.stringify({ message: 'Platform runtime is unavailable' }),
        );
        return;
      }
      proxyRequest(request, response, runtimeTarget, getRuntimeProxyHeaders());
      return;
    }
    if (requestUrl.pathname.startsWith(`${basePath}/api/`)) {
      proxyRequest(
        request,
        response,
        backendTarget,
        getBackendProxyHeaders(request),
        resolveBackendProxyPath(request.url || '/'),
      );
      return;
    }
    const basePrefix = `${basePath}/`;
    if (
      requestUrl.pathname !== basePath &&
      !requestUrl.pathname.startsWith(basePrefix)
    ) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const requestRelativePath = requestUrl.pathname.slice(basePath.length);
    const { filePath, isAsset } = resolveStaticRequest(requestRelativePath);
    const hasStaticFile =
      filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    // Client-side routes do not correspond to files; let the SPA router handle them.
    if (!hasStaticFile && isAsset) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const servedPath = hasStaticFile ? filePath : indexFile;
    response.writeHead(200, {
      'content-type': contentType(servedPath),
      ...(servedPath === indexFile ? { 'cache-control': 'no-store' } : {}),
    });
    if (servedPath === indexFile) response.end(indexHtml);
    else fs.createReadStream(servedPath).pipe(response);
  });
  server.ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => {
      process.stdout.write(
        `[static-client] listening at http://${host}:${port}${basePath}/\n`,
      );
      resolve(server);
    });
  });
  server.listen(port, host);
  return server;
}

if (require.main === module) {
  const server = start();
  server.ready.catch((error) => {
    process.stderr.write(
      `[static-client] failed to listen: ${error.message}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  isPlatformRuntimePath,
  resolveBackendProxyPath,
  resolveStaticRequest,
  safeJoin,
  start,
};
