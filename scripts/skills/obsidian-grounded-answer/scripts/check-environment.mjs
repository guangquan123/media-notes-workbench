import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveKnowledgeEnvironment } from './skill-environment.mjs';

async function inspectRoot(root) {
  const rootPath = path.resolve(typeof root === 'string' ? root : root.path);
  try {
    await access(rootPath, constants.R_OK);
    return { path: rootPath, readable: true };
  } catch {
    return { path: rootPath, readable: false };
  }
}

async function main() {
  const environment = await resolveKnowledgeEnvironment();
  const roots = await Promise.all(
    environment.config.roots.map((root) => inspectRoot(root)),
  );
  const indexDirectory = path.dirname(environment.indexPath);
  let indexWritable = false;
  try {
    await mkdir(indexDirectory, { recursive: true });
    await access(indexDirectory, constants.W_OK);
    indexWritable = true;
  } catch {
    indexWritable = false;
  }
  const ready = roots.every((root) => root.readable) && indexWritable;
  process.stdout.write(
    `${JSON.stringify(
      {
        configPath: environment.configPath,
        indexPath: environment.indexPath,
        indexWritable,
        readOnlyVault: true,
        ready,
        roots,
      },
      null,
      2,
    )}\n`,
  );
  if (!ready) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
