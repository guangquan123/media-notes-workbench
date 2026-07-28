import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  INDEX_SCHEMA_VERSION,
  chunkMarkdown,
  refreshIndex,
} from './knowledge-index.mjs';
import { expandQuery, rankChunks } from './knowledge-ranking.mjs';

async function readConfig(configPath) {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  if (!Array.isArray(config.roots) || config.roots.length === 0) {
    throw new Error('Knowledge search config requires a non-empty roots array');
  }
  if (
    config.excludeRelativePrefixes &&
    !Array.isArray(config.excludeRelativePrefixes)
  ) {
    throw new Error('excludeRelativePrefixes must be an array');
  }
  return config;
}

function defaultIndexPath() {
  return path.join(
    os.homedir(),
    '.cache',
    'obsidian-grounded-answer',
    'knowledge-search.index.json',
  );
}

async function searchKnowledge({
  configPath,
  forceRefresh = false,
  indexPath = defaultIndexPath(),
  limit,
  query,
}) {
  const resolvedConfigPath = path.resolve(configPath);
  const resolvedIndexPath = path.resolve(indexPath);
  const config = await readConfig(resolvedConfigPath);
  const refreshed = await refreshIndex({
    config,
    forceRefresh,
    indexPath: resolvedIndexPath,
  });
  const resultLimit = Math.max(
    1,
    Math.min(20, Number(limit || config.defaultLimit || 8)),
  );
  const results = rankChunks(query, refreshed.chunks, config, resultLimit);
  return {
    diagnostics: refreshed.diagnostics,
    index: {
      ...refreshed.counters,
      lastFullHashAt: refreshed.index.lastFullHashAt,
      path: resolvedIndexPath,
      schemaVersion: INDEX_SCHEMA_VERSION,
      updatedAt: refreshed.index.updatedAt,
    },
    matchedChunks: results.length,
    query,
    readOnly: true,
    results,
    roots: refreshed.roots.map((root) => ({ path: root })),
    searchedFiles: Object.keys(refreshed.index.documents).length,
  };
}

export {
  chunkMarkdown,
  defaultIndexPath,
  expandQuery,
  rankChunks,
  searchKnowledge,
};
