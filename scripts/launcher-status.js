#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const fileRetryState = new Int32Array(new SharedArrayBuffer(4));

function isRetryableWindowsFileError(error) {
  return ['EBUSY', 'EPERM', 'EACCES'].includes(error?.code);
}

function runFileOperationWithRetry(operation, attempts = 8, delayMs = 100) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!isRetryableWindowsFileError(error) || attempt === attempts) {
        throw error;
      }
      Atomics.wait(fileRetryState, 0, 0, delayMs);
    }
  }
}

function writeLauncherFailure({
  rootDir = path.resolve(__dirname, '..'),
  stage,
  message,
  detail,
  suggestion,
}) {
  const pidDir = path.join(rootDir, 'pids');
  const operationTokenPath = path.join(pidDir, 'launcher-operation.token');
  const failurePath = path.join(pidDir, 'launcher-failure.json');
  let operationToken = '';

  try {
    operationToken = fs.readFileSync(operationTokenPath, 'utf8').trim();
  } catch {
    return false;
  }
  if (!operationToken) return false;

  const temporaryPath = [failurePath, process.pid, 'tmp'].join('.');
  const failure = {
    operationToken,
    stage,
    message,
    detail,
    suggestion,
    timestamp: Date.now(),
  };

  try {
    fs.mkdirSync(pidDir, { recursive: true });
    runFileOperationWithRetry(() =>
      fs.writeFileSync(temporaryPath, JSON.stringify(failure), 'utf8'),
    );
    runFileOperationWithRetry(() => {
      try {
        fs.unlinkSync(failurePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      fs.renameSync(temporaryPath, failurePath);
    });
    return true;
  } catch {
    try {
      runFileOperationWithRetry(() => fs.unlinkSync(temporaryPath));
    } catch {
      // 临时文件不存在或已被清理。
    }
    return false;
  }
}

module.exports = {
  writeLauncherFailure,
};
