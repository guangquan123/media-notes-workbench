#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveRuntimePaths } = require('./runtime-paths.js');

const DEFAULT_LOCAL_RUNTIME_CONFIG = {
  mode: 'local',
  database: {
    kind: 'sqlite',
    file: 'data/workbench.sqlite',
  },
  auth: {
    kind: 'local',
    ownerId: 'local-owner',
  },
  ai: {
    provider: 'external',
  },
  storage: {
    kind: 'local',
    root: 'data/storage',
  },
};

function readExistingLocalRuntimeConfig(configPath) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `现有本地运行配置无法解析: ${configPath}。请修复或备份后删除该文件，再重新启动。`,
      { cause: error },
    );
  }

  if (config?.mode !== 'local') {
    throw new Error(
      `Windows 本地启动器检测到现有运行配置不是 local 模式: ${configPath}。` +
        '为避免覆盖你的配置，启动器已停止；请将 mode 调整为 local 后重试。',
    );
  }

  return config;
}

function ensureLocalRuntimeConfig(rootDir, options = {}) {
  const environment = options.env || process.env;
  const paths = resolveRuntimePaths({ cwd: rootDir, env: environment });
  const usesSeparatedPaths = Boolean(
    options.configDir ||
      environment.WORKBENCH_CONFIG_DIR ||
      environment.WORKBENCH_HOME ||
      environment.WORKBENCH_INSTALLED === '1',
  );
  const configDir = options.configDir || environment.WORKBENCH_CONFIG_DIR ||
    (usesSeparatedPaths ? paths.configDir : rootDir);
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, '.runtime-config.json');

  if (fs.existsSync(configPath)) {
    readExistingLocalRuntimeConfig(configPath);
    return { configPath, created: false };
  }

  const dataDir = usesSeparatedPaths ? paths.dataDir : path.join(rootDir, 'data');
  const runtimeConfig = usesSeparatedPaths
    ? {
        ...DEFAULT_LOCAL_RUNTIME_CONFIG,
        database: { kind: 'sqlite', file: path.join(dataDir, 'workbench.sqlite') },
        storage: { kind: 'local', root: path.join(dataDir, 'storage') },
      }
    : DEFAULT_LOCAL_RUNTIME_CONFIG;
  const content = `${JSON.stringify(runtimeConfig, null, 2)}\n`;
  try {
    fs.writeFileSync(configPath, content, {
      encoding: 'utf8',
      flag: 'wx',
    });
    return { configPath, created: true };
  } catch (error) {
    if (error?.code === 'EEXIST') {
      readExistingLocalRuntimeConfig(configPath);
      return { configPath, created: false };
    }
    throw error;
  }
}

module.exports = {
  DEFAULT_LOCAL_RUNTIME_CONFIG,
  ensureLocalRuntimeConfig,
  readExistingLocalRuntimeConfig,
};
