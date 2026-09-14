#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ENDPOINT_FILE_NAME = 'launcher-endpoint.json';
const retryState = new Int32Array(new SharedArrayBuffer(4));

function parsePort(value) {
  const port = Number.parseInt(String(value), 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function normalizeBasePath(value) {
  return `${value || '/'}`.replace(/\/+$/u, '') || '';
}

function endpointPath(stateDir) {
  return path.join(stateDir, ENDPOINT_FILE_NAME);
}

function isRetryableEndpointWriteError(error) {
  return ['EACCES', 'EBADF', 'EBUSY', 'EPERM'].includes(error?.code);
}

function waitBeforeRetry(milliseconds = 100) {
  Atomics.wait(retryState, 0, 0, milliseconds);
}

function readLauncherEndpoint(stateDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(endpointPath(stateDir), 'utf8'));
    const clientPort = parsePort(raw?.clientPort);
    if (!clientPort || typeof raw?.clientHost !== 'string' || !raw.clientHost) {
      return null;
    }
    return {
      clientHost: raw.clientHost,
      clientPort,
      clientBasePath: normalizeBasePath(raw.clientBasePath),
    };
  } catch {
    return null;
  }
}

function writeLauncherEndpoint(stateDir, endpoint) {
  const clientPort = parsePort(endpoint?.clientPort);
  if (!clientPort || typeof endpoint?.clientHost !== 'string' || !endpoint.clientHost) {
    throw new Error('启动器未获得有效的本地页面地址。');
  }

  fs.mkdirSync(stateDir, { recursive: true });
  const target = endpointPath(stateDir);
  const payload = {
    clientHost: endpoint.clientHost,
    clientPort,
    clientBasePath: normalizeBasePath(endpoint.clientBasePath),
  };

  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      // Windows can keep a just-read JSON file open briefly. Replacing an
      // existing file with renameSync then fails with EBADF on some systems,
      // even though the current user owns the file. This is only a small
      // launcher hint: readers ignore an incomplete JSON read and poll again,
      // so a direct overwrite is safer than letting a file-replace race block
      // the whole application startup.
      fs.writeFileSync(target, JSON.stringify(payload), 'utf8');
      return payload;
    } catch (error) {
      lastError = error;
      if (!isRetryableEndpointWriteError(error) || attempt === 8) break;
      waitBeforeRetry();
    }
  }
  throw lastError;
}

function isPortAvailable(host, port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    const finish = (available) => {
      probe.removeAllListeners();
      if (available) {
        probe.close(() => resolve(true));
      } else {
        resolve(false);
      }
    };
    probe.once('error', () => finish(false));
    probe.once('listening', () => finish(true));
    probe.listen({ host, port, exclusive: true });
  });
}

async function findAvailablePort({ host, preferredPort, attempts = 20 }) {
  const preferred = parsePort(preferredPort);
  if (!preferred) throw new Error('启动器未获得有效的首选端口。');

  const maxAttempts = Math.max(1, Number.parseInt(String(attempts), 10) || 1);
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferred + offset;
    if (candidate > 65535) break;
    if (await isPortAvailable(host, candidate)) return candidate;
  }
  throw new Error(
    `未能找到可用的本地页面端口（已尝试 ${preferred}-${Math.min(
      65535,
      preferred + maxAttempts - 1,
    )}）。`,
  );
}

module.exports = {
  ENDPOINT_FILE_NAME,
  endpointPath,
  findAvailablePort,
  isPortAvailable,
  isRetryableEndpointWriteError,
  readLauncherEndpoint,
  writeLauncherEndpoint,
};
