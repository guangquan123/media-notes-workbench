import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const INDEX_SCHEMA_VERSION = 2;
const MAX_CHUNK_CHARACTERS = 1600;
const DEFAULT_FULL_HASH_HOURS = 24;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function withoutFrontmatter(raw = '') {
  return String(raw).replace(/^---\s*\n[\s\S]*?\n---\s*\n?/u, '');
}

function cleanHeading(value = '') {
  return value
    .replace(/[*_`]/gu, '')
    .replace(/\s+#+\s*$/u, '')
    .trim();
}

function splitOversizedContent(content, maxCharacters = MAX_CHUNK_CHARACTERS) {
  const chunks = [];
  let current = '';
  const paragraphs = content.split(/(?<=\n)/u);
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > maxCharacters) {
      chunks.push(current.trim());
      current = '';
    }
    if (paragraph.length <= maxCharacters) {
      current += paragraph;
      continue;
    }
    for (let start = 0; start < paragraph.length; start += maxCharacters) {
      const section = paragraph.slice(start, start + maxCharacters).trim();
      if (section) {
        chunks.push(section);
      }
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

function chunkMarkdown({ filePath, relativePath, raw }) {
  const lines = withoutFrontmatter(raw).replace(/\r\n/gu, '\n').split('\n');
  const chunks = [];
  const headings = [];
  let content = [];

  const flush = () => {
    const value = content.join('\n').trim();
    if (!value) {
      return;
    }
    const headingPath = headings.filter(Boolean).join(' > ') || relativePath;
    for (const section of splitOversizedContent(value)) {
      chunks.push({
        content: section,
        headingPath,
        path: filePath,
        relativePath,
      });
    }
  };

  for (const line of lines) {
    const matched = line.match(/^(#{1,6})\s+(.+?)\s*$/u);
    if (!matched) {
      content.push(line);
      continue;
    }
    flush();
    content = [];
    const level = matched[1].length;
    headings.length = level - 1;
    headings[level - 1] = cleanHeading(matched[2]);
  }
  flush();
  return chunks;
}

function normalizePrefixes(prefixes = []) {
  return prefixes
    .map((prefix) => String(prefix).replace(/^\/+|\/+$/gu, ''))
    .filter(Boolean);
}

function isExcluded(root, target, prefixes) {
  const relative = path.relative(root, target).split(path.sep).join('/');
  return prefixes.some(
    (prefix) => relative === prefix || relative.startsWith(`${prefix}/`),
  );
}

async function walkMarkdown(
  root,
  diagnostics,
  excludedPrefixes,
  scopeRoot = root,
) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const collected = [];
    for (const entry of entries) {
      const target = path.join(root, entry.name);
      if (
        entry.name.startsWith('.') ||
        isExcluded(scopeRoot, target, excludedPrefixes)
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        collected.push(
          ...(await walkMarkdown(
            target,
            diagnostics,
            excludedPrefixes,
            scopeRoot,
          )),
        );
      } else if (
        entry.isFile() &&
        entry.name.toLocaleLowerCase('en-US').endsWith('.md')
      ) {
        collected.push(target);
      }
    }
    return collected;
  } catch (error) {
    diagnostics.push({
      level: 'warning',
      message: `Cannot read directory: ${error.code || error.message}`,
      path: root,
    });
    return [];
  }
}

function emptyIndex() {
  return {
    documents: {},
    lastFullHashAt: null,
    schemaVersion: INDEX_SCHEMA_VERSION,
    updatedAt: null,
  };
}

async function readIndex(indexPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    if (
      parsed.schemaVersion !== INDEX_SCHEMA_VERSION ||
      typeof parsed.documents !== 'object'
    ) {
      return emptyIndex();
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return emptyIndex();
    }
    throw new Error(`Cannot read index ${indexPath}: ${error.message}`);
  }
}

async function writeIndex(indexPath, index) {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(index)}\n`, 'utf8');
  await fs.rename(temporaryPath, indexPath);
}

function isFullHashDue(index, fullHashHours, forceRefresh) {
  if (forceRefresh || !index.lastFullHashAt) {
    return true;
  }
  const elapsed = Date.now() - Date.parse(index.lastFullHashAt);
  return elapsed >= fullHashHours * 60 * 60 * 1000;
}

async function refreshIndex({ config, forceRefresh = false, indexPath }) {
  const index = await readIndex(indexPath);
  const diagnostics = [];
  const roots = config.roots.map((root) =>
    path.resolve(typeof root === 'string' ? root : root.path),
  );
  const excludedPrefixes = normalizePrefixes(
    config.excludeRelativePrefixes || [],
  );
  const fullHashHours = Number(
    config.fullHashValidationHours || DEFAULT_FULL_HASH_HOURS,
  );
  const validateAllHashes = isFullHashDue(index, fullHashHours, forceRefresh);
  const filesByPath = new Map();

  for (const root of roots) {
    const files = await walkMarkdown(root, diagnostics, excludedPrefixes);
    for (const filePath of files) {
      filesByPath.set(filePath, root);
    }
  }

  const nextDocuments = {};
  const counters = { added: 0, changed: 0, removed: 0, reused: 0 };
  for (const [filePath, root] of filesByPath.entries()) {
    try {
      const fileStat = await fs.stat(filePath);
      const previous = index.documents[filePath];
      const fastReusable =
        !validateAllHashes &&
        previous &&
        previous.size === fileStat.size &&
        previous.mtimeMs === fileStat.mtimeMs;
      if (fastReusable) {
        nextDocuments[filePath] = previous;
        counters.reused += 1;
        continue;
      }

      const raw = await fs.readFile(filePath, 'utf8');
      const contentHash = sha256(raw);
      if (previous?.sha256 === contentHash) {
        nextDocuments[filePath] = {
          ...previous,
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
        };
        counters.reused += 1;
        continue;
      }
      const relativePath = path.relative(root, filePath);
      nextDocuments[filePath] = {
        chunks: chunkMarkdown({ filePath, raw, relativePath }),
        mtimeMs: fileStat.mtimeMs,
        relativePath,
        root,
        sha256: contentHash,
        size: fileStat.size,
      };
      if (previous) {
        counters.changed += 1;
      } else {
        counters.added += 1;
      }
    } catch (error) {
      diagnostics.push({
        level: 'warning',
        message: `Cannot index file: ${error.code || error.message}`,
        path: filePath,
      });
    }
  }
  counters.removed = Object.keys(index.documents).filter(
    (filePath) => !filesByPath.has(filePath),
  ).length;

  const now = new Date().toISOString();
  const nextIndex = {
    documents: nextDocuments,
    lastFullHashAt: validateAllHashes ? now : index.lastFullHashAt,
    schemaVersion: INDEX_SCHEMA_VERSION,
    updatedAt: now,
  };
  await writeIndex(indexPath, nextIndex);
  return {
    chunks: Object.values(nextDocuments).flatMap((document) => document.chunks),
    counters,
    diagnostics,
    index: nextIndex,
    roots,
  };
}

export { INDEX_SCHEMA_VERSION, chunkMarkdown, refreshIndex };
