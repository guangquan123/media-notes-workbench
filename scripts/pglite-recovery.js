#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function getPgliteLockPath(dataDir) {
  return path.join(dataDir, 'pgdata', 'postmaster.pid');
}

function removeStalePgliteLock(dataDir) {
  const lockPath = getPgliteLockPath(dataDir);
  if (!fs.existsSync(lockPath)) {
    return { removed: false, lockPath };
  }

  fs.unlinkSync(lockPath);
  return { removed: true, lockPath };
}

module.exports = {
  getPgliteLockPath,
  removeStalePgliteLock,
};
