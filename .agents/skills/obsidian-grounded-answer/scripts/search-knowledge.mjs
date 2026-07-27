import { searchKnowledge } from './knowledge-search-core.mjs';

function parseArgs(args) {
  const parsed = {};
  const supported = new Set([
    '--config',
    '--index',
    '--limit',
    '--query',
    '--refresh',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!supported.has(option)) {
      throw new Error(`Unsupported option: ${option}`);
    }
    if (option === '--refresh') {
      parsed.forceRefresh = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${option} requires a value`);
    }
    parsed[option.slice(2)] = value;
    index += 1;
  }
  if (!parsed.query?.trim()) {
    throw new Error('--query is required');
  }
  if (!parsed.config) {
    throw new Error('--config is required');
  }
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await searchKnowledge({
    configPath: options.config,
    forceRefresh: options.forceRefresh,
    indexPath: options.index,
    limit: options.limit,
    query: options.query,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
