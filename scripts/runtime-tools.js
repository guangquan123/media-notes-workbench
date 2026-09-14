#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function getBundledToolsDirectory(appRoot) {
  const root = path.resolve(appRoot || process.env.WORKBENCH_APP_ROOT || process.cwd());
  const toolsDirectory = path.join(root, 'tools');
  return fs.existsSync(toolsDirectory) ? toolsDirectory : '';
}

function applyBundledToolPath(environment = process.env, appRoot) {
  const toolsDirectory = getBundledToolsDirectory(
    appRoot || environment.WORKBENCH_APP_ROOT,
  );
  if (!toolsDirectory) return '';

  const currentPath = environment.PATH || '';
  const pathEntries = currentPath.split(path.delimiter).filter(Boolean);
  if (!pathEntries.some((entry) => path.resolve(entry) === toolsDirectory)) {
    environment.PATH = [toolsDirectory, ...pathEntries].join(path.delimiter);
  }
  return toolsDirectory;
}

module.exports = {
  applyBundledToolPath,
  getBundledToolsDirectory,
};
