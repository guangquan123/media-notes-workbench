import { searchKnowledge } from './knowledge-search-core.mjs';
import { resolveKnowledgeEnvironment } from './skill-environment.mjs';

function parseArgs(args) {
  const parsed = {};
  const supported = new Set(['--limit', '--query', '--refresh']);
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--config' || option === '--index') {
      throw new Error(
        'Use KNOWLEDGE_SEARCH_CONFIG and KNOWLEDGE_SEARCH_INDEX to select approved paths',
      );
    }
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
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const environment = await resolveKnowledgeEnvironment();
  const result = await searchKnowledge({
    configPath: environment.configPath,
    forceRefresh: options.forceRefresh,
    indexPath: environment.indexPath,
    limit: options.limit,
    query: options.query,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
