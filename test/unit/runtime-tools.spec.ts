const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  applyBundledToolPath,
  getBundledToolsDirectory,
} = require('../../scripts/runtime-tools.js');

describe('bundled runtime tools', () => {
  it('prepends an installed tools directory only once', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-notes-tools-'));
    const toolsDirectory = path.join(root, 'tools');
    fs.mkdirSync(toolsDirectory);
    const environment = { PATH: 'C:\\Windows\\System32' };

    expect(getBundledToolsDirectory(root)).toBe(toolsDirectory);
    expect(applyBundledToolPath(environment, root)).toBe(toolsDirectory);
    expect(environment.PATH.split(path.delimiter)[0]).toBe(toolsDirectory);
    applyBundledToolPath(environment, root);
    expect(environment.PATH.split(path.delimiter).filter((entry) => entry === toolsDirectory)).toHaveLength(1);
  });

  it('leaves environments without a tools directory unchanged', () => {
    const environment = { PATH: 'C:\\Windows\\System32' };

    expect(applyBundledToolPath(environment, os.tmpdir())).toBe('');
    expect(environment.PATH).toBe('C:\\Windows\\System32');
  });
});
