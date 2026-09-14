const fs = require('node:fs');
const path = require('node:path');

describe('release preflight wiring', () => {
  const root = path.resolve(__dirname, '../..');

  it('checks the locked dependency graph and strict media gate', () => {
    const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const preflight = fs.readFileSync(
      path.join(root, 'scripts', 'release-preflight.js'),
      'utf8',
    );

    expect(packageJson).toContain('"release:check"');
    expect(preflight).toContain("'package-lock.json'");
    expect(preflight).toContain("process.argv.includes('--strict-media')");
  });

  it('ships bundled tools through the installed runtime and manifest', () => {
    const packager = fs.readFileSync(
      path.join(root, 'scripts', 'package-windows.js'),
      'utf8',
    );
    const launcher = fs.readFileSync(
      path.join(root, 'scripts', 'installed-launcher.js'),
      'utf8',
    );

    expect(packager).toContain("const bundledToolsDir = path.join(rootDir, 'tools')");
    expect(packager).toContain("copy(bundledToolsDir, path.join(appStage, 'tools'))");
    expect(packager).toContain('tools: fs.existsSync(path.join(appStage, \'tools\'))');
    expect(launcher).toContain("require('./runtime-tools.js')");
    expect(launcher).toContain('applyBundledToolPath(process.env, appRoot)');
  });
});
