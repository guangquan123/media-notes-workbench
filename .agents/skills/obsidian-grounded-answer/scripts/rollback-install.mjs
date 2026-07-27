import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--yes') {
      parsed.yes = true;
      continue;
    }
    if (option !== '--manifest') {
      throw new Error(`Unsupported option: ${option}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('--manifest requires a value');
    }
    parsed.manifest = value;
    index += 1;
  }
  if (!parsed.yes) {
    throw new Error('Rollback changes user-level files; pass --yes to confirm');
  }
  if (!parsed.manifest) {
    throw new Error('--manifest is required');
  }
  return parsed;
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function moveIfPresent(source, target) {
  if (!(await pathExists(source))) {
    return null;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await rename(source, target);
  return target;
}

async function restoreInstallation(installation, manifestDirectory) {
  if (!installation.changed) {
    return { changed: false, label: installation.label };
  }
  const displacedPath = await moveIfPresent(
    installation.target,
    path.join(
      manifestDirectory,
      `rollback-displaced-${installation.label}-skill`,
    ),
  );
  if (installation.backupPath) {
    await moveIfPresent(installation.backupPath, installation.target);
  }
  return {
    changed: true,
    displacedPath,
    label: installation.label,
    restoredBackup: installation.backupPath || null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.rolledBackAt) {
    process.stdout.write(
      `${JSON.stringify(
        {
          changed: false,
          manifestPath,
          rolledBackAt: manifest.rolledBackAt,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const manifestDirectory = path.dirname(manifestPath);
  const installations = [];
  for (const installation of manifest.installations || []) {
    installations.push(
      await restoreInstallation(installation, manifestDirectory),
    );
  }

  let globalRulesChanged = false;
  if (manifest.globalRulesBackup) {
    const original = await readFile(manifest.globalRulesBackup, 'utf8');
    await writeFile(manifest.globalAgentsPath, original, 'utf8');
    globalRulesChanged = true;
  } else if (await pathExists(manifest.globalAgentsPath)) {
    await moveIfPresent(
      manifest.globalAgentsPath,
      path.join(manifestDirectory, 'rollback-displaced-AGENTS.md'),
    );
    globalRulesChanged = true;
  }

  const rolledBackAt = new Date().toISOString();
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        ...manifest,
        rollback: { globalRulesChanged, installations },
        rolledBackAt,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        changed:
          globalRulesChanged || installations.some((item) => item.changed),
        globalRulesChanged,
        installations,
        manifestPath,
        rolledBackAt,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
