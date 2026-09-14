import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('one-command Windows release packaging', () => {
  it('provides a Node-only release command without npm subcommands', async () => {
    const scriptPath = join(
      process.cwd(),
      'scripts',
      'package-windows-release.js',
    );
    const script = await readFile(scriptPath, 'utf8');

    expect(script).toContain("'scripts/package-windows.js', ['--compile']");
    expect(script).toContain("'scripts/release-preflight.js', ['--strict-media']");
    expect(script).toContain('waitForStableInstaller(installerPath)');
    expect(script).not.toContain('npm run');
  });
});
