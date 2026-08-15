#!/usr/bin/env node
'use strict';

function isSuccessful(response) {
  return response.status >= 200 && response.status < 300;
}

function isRuntimeStatusReady(response) {
  if (!isSuccessful(response) || !response.contentType.includes('application/json')) {
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

function extractEntryResources(response, pageUrl) {
  if (
    !isSuccessful(response) ||
    !response.contentType.includes('text/html') ||
    !/id=["']root["']/.test(response.body)
  ) {
    return [];
  }

  const resources = [];
  const scripts = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const stylesheets = /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = scripts.exec(response.body))) {
    resources.push({ kind: 'script', url: new URL(match[1], pageUrl).toString() });
  }
  while ((match = stylesheets.exec(response.body))) {
    resources.push({ kind: 'stylesheet', url: new URL(match[1], pageUrl).toString() });
  }
  return resources;
}

function isEntryResourceReady(resource, response) {
  if (!isSuccessful(response)) return false;
  return resource.kind === 'script'
    ? /(?:javascript|ecmascript)/.test(response.contentType)
    : response.contentType.includes('text/css');
}

async function isApplicationReady({ pageUrl, runtimeUrl, request }) {
  const [page, runtime] = await Promise.all([request(pageUrl), request(runtimeUrl)]);
  if (!isRuntimeStatusReady(runtime)) return false;

  const resources = extractEntryResources(page, pageUrl);
  if (resources.length === 0 || !resources.some((resource) => resource.kind === 'script')) {
    return false;
  }

  const responses = await Promise.all(resources.map((resource) => request(resource.url)));
  return resources.every((resource, index) => isEntryResourceReady(resource, responses[index]));
}

module.exports = {
  extractEntryResources,
  isApplicationReady,
  isEntryResourceReady,
  isRuntimeStatusReady,
};
