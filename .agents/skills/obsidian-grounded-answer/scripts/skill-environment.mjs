import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultIndexPath } from './knowledge-search-core.mjs';

const DEFAULT_CONFIG_PATH =
  '/Users/yangjie/YJ/codex_workspace/knowledge-workbench/data/knowledge-search.config.json';

async function requireReadableFile(filePath, label) {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`${label} was not found or is not readable: ${filePath}`);
  }
}

async function resolveKnowledgeEnvironment(env = process.env) {
  const configPath = path.resolve(
    env.KNOWLEDGE_SEARCH_CONFIG || DEFAULT_CONFIG_PATH,
  );
  const indexPath = path.resolve(
    env.KNOWLEDGE_SEARCH_INDEX || defaultIndexPath(),
  );
  await requireReadableFile(configPath, 'Knowledge search config');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!Array.isArray(config.roots) || config.roots.length === 0) {
    throw new Error(`Knowledge search config has no roots: ${configPath}`);
  }
  return {
    cacheHome: path.join(os.homedir(), '.cache', 'obsidian-grounded-answer'),
    config,
    configPath,
    indexPath,
  };
}

export { DEFAULT_CONFIG_PATH, resolveKnowledgeEnvironment };
