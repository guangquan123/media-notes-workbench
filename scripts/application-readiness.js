#!/usr/bin/env node
'use strict';

function isSuccessful(response) {
  return response.status >= 200 && response.status < 300;
}

function isRuntimeStatusReady(response) {
  if (
    !isSuccessful(response) ||
    !response.contentType.includes('application/json')
  ) {
    return false;
  }

  try {
    const status = JSON.parse(response.body);
    return (
      (status.mode === 'local' || status.mode === 'miaoda') &&
      typeof status.label === 'string' &&
      status.label.length > 0 &&
      (status.auth === 'local' || status.auth === 'platform') &&
      (status.database === 'local' || status.database === 'platform') &&
      (status.ai === 'external' || status.ai === 'builtin') &&
      (status.storage === 'local' || status.storage === 'platform') &&
      status.ready === true
    );
  } catch {
    return false;
  }
}

function isSystemReadinessReady(response) {
  if (
    !isSuccessful(response) ||
    !response.contentType.includes('application/json')
  ) {
    return false;
  }

  try {
    const status = JSON.parse(response.body);
    const requiredBooleanFields = [
      'ytDlp',
      'ffmpeg',
      'whisperCli',
      'whisperModel',
      'larkCli',
      'tencentAsr',
      'tencentAsrEnabled',
      'ready',
      'platformReady',
      'mediaReady',
      'documentReady',
      'pdfReady',
    ];
    return requiredBooleanFields.every(
      (field) => typeof status[field] === 'boolean',
    );
  } catch {
    return false;
  }
}

function extractEntryResources(response, pageUrl) {
  if (
    !isSuccessful(response) ||
    !response.contentType.includes('text/html') ||
    !/id=["']root["']/.test(response.body)
  ) {
    return [];
  }

  const resources = [];
  const scripts =
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const stylesheets =
    /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = scripts.exec(response.body))) {
    resources.push({
      kind: 'script',
      url: new URL(match[1], pageUrl).toString(),
    });
  }
  while ((match = stylesheets.exec(response.body))) {
    resources.push({
      kind: 'stylesheet',
      url: new URL(match[1], pageUrl).toString(),
    });
  }
  return resources;
}

function isEntryResourceReady(resource, response) {
  if (!isSuccessful(response)) return false;
  return resource.kind === 'script'
    ? /(?:javascript|ecmascript)/.test(response.contentType)
    : response.contentType.includes('text/css');
}

function describeHttpStatus(response) {
  return response.status > 0 ? `HTTP ${response.status}` : '无响应';
}

async function inspectApplicationReadiness({
  pageUrl,
  readinessUrl,
  runtimeUrl,
  request,
}) {
  const [page, runtime, readiness] = await Promise.all([
    request(pageUrl),
    request(runtimeUrl),
    request(readinessUrl),
  ]);
  if (!isRuntimeStatusReady(runtime)) {
    return {
      ready: false,
      reason: `后台运行状态接口未返回有效响应（${describeHttpStatus(runtime)}）`,
    };
  }
  if (!isSystemReadinessReady(readiness)) {
    return {
      ready: false,
      reason: `核心环境检测接口未返回有效响应（${describeHttpStatus(readiness)}）`,
    };
  }

  const resources = extractEntryResources(page, pageUrl);
  if (
    resources.length === 0 ||
    !resources.some((resource) => resource.kind === 'script')
  ) {
    return {
      ready: false,
      reason: `前端入口未返回有效页面（${describeHttpStatus(page)}）`,
    };
  }

  const responses = await Promise.all(
    resources.map((resource) => request(resource.url)),
  );
  const failedResourceIndex = resources.findIndex(
    (resource, index) => !isEntryResourceReady(resource, responses[index]),
  );
  if (failedResourceIndex >= 0) {
    return {
      ready: false,
      reason: `前端资源加载失败：${resources[failedResourceIndex].url}`,
    };
  }
  return { ready: true, reason: '' };
}

async function isApplicationReady(input) {
  return (await inspectApplicationReadiness(input)).ready;
}

module.exports = {
  extractEntryResources,
  inspectApplicationReadiness,
  isApplicationReady,
  isEntryResourceReady,
  isRuntimeStatusReady,
  isSystemReadinessReady,
};
