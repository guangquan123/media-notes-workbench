import { promises as fs } from 'node:fs';
import path from 'node:path';
import { searchKnowledge } from './knowledge-search-core.mjs';

function parseArgs(args) {
  const parsed = {};
  const supported = new Set(['--cases', '--config', '--index', '--top-k']);
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!supported.has(option)) {
      throw new Error(`Unsupported option: ${option}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${option} requires a value`);
    }
    parsed[option.slice(2)] = value;
    index += 1;
  }
  for (const required of ['cases', 'config']) {
    if (!parsed[required]) {
      throw new Error(`--${required} is required`);
    }
  }
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const casesPath = path.resolve(options.cases);
  const cases = JSON.parse(await fs.readFile(casesPath, 'utf8'));
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('Evaluation cases must be a non-empty array');
  }
  const topK = Math.max(1, Math.min(20, Number(options['top-k'] || 3)));
  const details = [];
  for (const evaluationCase of cases) {
    const result = await searchKnowledge({
      configPath: options.config,
      indexPath: options.index,
      limit: topK,
      query: evaluationCase.query,
    });
    const matched = result.results.some((item) =>
      item.path.includes(evaluationCase.expectedPathPattern),
    );
    details.push({
      expectedPathPattern: evaluationCase.expectedPathPattern,
      matched,
      query: evaluationCase.query,
      returnedPaths: result.results.map((item) => item.path),
    });
  }
  const passedCases = details.filter((item) => item.matched).length;
  process.stdout.write(
    `${JSON.stringify(
      {
        details,
        passedCases,
        topK,
        topKHitRate: passedCases / details.length,
        totalCases: details.length,
      },
      null,
      2,
    )}\n`,
  );
  if (passedCases !== details.length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
