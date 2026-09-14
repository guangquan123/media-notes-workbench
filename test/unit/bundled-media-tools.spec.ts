import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getBundledMediaToolPath,
  resolveMediaToolCommand,
} from '../../server/common/utils/bundled-media-tools';

describe('bundled media tools', () => {
  it('uses shipped Windows media tools without depending on PATH', () => {
    const appRoot: string = mkdtempSync(join(tmpdir(), 'media-notes-tools-'));
    const toolsDir: string = join(appRoot, 'tools');
    const ffmpegPath: string = join(toolsDir, 'ffmpeg.exe');
    const ytDlpPath: string = join(toolsDir, 'yt-dlp.exe');
    mkdirSync(toolsDir);
    writeFileSync(ffmpegPath, 'fixture');
    writeFileSync(ytDlpPath, 'fixture');

    expect(getBundledMediaToolPath('ffmpeg', appRoot)).toBe(ffmpegPath);
    expect(getBundledMediaToolPath('yt-dlp.exe', appRoot)).toBe(ytDlpPath);
    expect(resolveMediaToolCommand('ffmpeg', appRoot)).toBe(ffmpegPath);
  });

  it('keeps external commands unchanged when the app does not ship a tool', () => {
    const appRoot: string = mkdtempSync(join(tmpdir(), 'media-notes-tools-'));

    expect(getBundledMediaToolPath('whisper-cli', appRoot)).toBeUndefined();
    expect(resolveMediaToolCommand('whisper-cli', appRoot)).toBe('whisper-cli');
  });
});
