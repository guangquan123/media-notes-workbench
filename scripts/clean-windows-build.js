#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const generatedPaths = [
  path.join(projectRoot, 'dist', 'client'),
  path.join(projectRoot, 'dist', 'server'),
  path.join(projectRoot, 'dist', 'shared'),
  path.join(projectRoot, 'dist', 'sourcemaps'),
  path.join(projectRoot, 'dist', 'node_modules'),
  path.join(projectRoot, 'dist', 'package.json'),
  path.join(projectRoot, 'dist', 'tsconfig.node.tsbuildinfo'),
];

for (const target of generatedPaths) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    process.stdout.write(`[clean-windows-build] 已清理: ${path.relative(projectRoot, target)}\n`);
  }
}
