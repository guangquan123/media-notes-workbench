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
    expect(preflight).toContain("['ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe']");
    expect(preflight).toContain("node_modules/@larksuite/cli/bin/lark-cli.exe");
    expect(preflight).toContain("readJson('tools/tool-manifest.json')");
    expect(preflight).toContain("manifest.modelPolicy !== 'external-only'");
    expect(preflight).toContain("createHash('sha256')");
    expect(preflight).toContain('gguf|onnx|safetensors');
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
    expect(packager).toContain("const BUNDLED_LARK_CLI_PATH");
    expect(packager).toContain('缺少内置飞书授权组件');
    expect(packager).toContain('tools: REQUIRED_BUNDLED_TOOL_FILES');
    expect(launcher).toContain("require('./runtime-tools.js')");
    expect(launcher).toContain('applyBundledToolPath(process.env, appRoot)');
  });
});
