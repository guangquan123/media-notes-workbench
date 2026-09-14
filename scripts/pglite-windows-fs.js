#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PATCH_MARKER = Symbol.for('media-notes.pgliteRenameFallback');

function isWithinDirectory(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
}

function installPgliteRenameFallback(dataDir, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const platform = options.platform || process.platform;
  if (platform !== 'win32' || fileSystem.renameSync?.[PATCH_MARKER]) {
    return false;
  }

  const root = path.resolve(dataDir);
  const renameSync = fileSystem.renameSync;
  function renameWithPgliteFallback(source, destination) {
    try {
      return renameSync.call(fileSystem, source, destination);
    } catch (error) {
      const sourcePath = path.resolve(source);
      const destinationPath = path.resolve(destination);
      if (
        error?.code !== 'EBADF' ||
        !isWithinDirectory(sourcePath, root) ||
        !isWithinDirectory(destinationPath, root)
      ) {
        throw error;
      }

      // PGlite's Windows NodeFS can surface EBADF while atomically replacing
      // an internal checkpoint. The source and destination are both inside
      // its private data directory; copying then removing the temp source
      // preserves the intended completed checkpoint without touching notes.
      fileSystem.copyFileSync(sourcePath, destinationPath);
      fileSystem.unlinkSync(sourcePath);
      return undefined;
    }
  }
  renameWithPgliteFallback[PATCH_MARKER] = true;
  fileSystem.renameSync = renameWithPgliteFallback;
  return true;
}

module.exports = {
  installPgliteRenameFallback,
  isWithinDirectory,
};
