import {
  FrameExtractionService,
  calculateVisualInformationScore,
  computePerceptualHash,
  hammingDistance,
  parseShowInfo,
} from '../../server/modules/note-jobs/frame-extraction.service';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('frame extraction helpers', () => {
  it('parses real pts timestamps and scene metadata from ffmpeg showinfo', () => {
    const stderr = [
      '[Parsed_metadata_1] lavfi.scene_score=0.612345',
      '[Parsed_showinfo_3] n: 1 pts: 231 pts_time:7.7 pos:1',
      '[Parsed_showinfo_3] n: 2 pts: 1830 pts_time:61 pos:2',
    ].join('\n');
    expect(parseShowInfo(stderr)).toEqual([
      { sceneScore: 0.612345, timestamp: 7.7 },
      { sceneScore: 0, timestamp: 61 },
    ]);
  });

  it('detects identical and different perceptual hashes', () => {
    const gradient = Uint8Array.from(
      { length: 72 },
      (_, index) => (index * 17) % 256,
    );
    const reversed = Uint8Array.from(gradient).reverse();
    const left = computePerceptualHash(gradient);
    expect(hammingDistance(left, left)).toBe(0);
    expect(hammingDistance(left, computePerceptualHash(reversed))).toBeGreaterThan(5);
  });

  it('rejects blank frames through a low visual information score', () => {
    const blank = new Uint8Array(72).fill(255);
    const detailed = Uint8Array.from(
      { length: 72 },
      (_, index) => (index % 2 === 0 ? 0 : 255),
    );
    expect(calculateVisualInformationScore(blank)).toBeLessThan(0.12);
    expect(calculateVisualInformationScore(detailed)).toBeGreaterThan(0.7);
  });

  it('extracts real-timestamp PNG frames from a synthetic changing video', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frame-extraction-test-'));
    const videoPath = join(directory, 'synthetic.mp4');
    try {
      await command('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=white:s=640x360:d=2:r=10',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=640x360:d=2:r=10',
        '-filter_complex',
        '[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p',
        '-y',
        videoPath,
      ]);
      const frames = await new FrameExtractionService().extractKeyFrames(
        videoPath,
        directory,
      );
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every((frame) => frame.filePath.endsWith('.png'))).toBe(true);
      expect(frames.every((frame) => Number.isFinite(frame.timestamp))).toBe(true);
      expect(frames.some((frame) => frame.timestamp >= 1.5)).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }, 30_000);
});

function command(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const errors: Buffer[] = [];
    process.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    process.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(errors).toString('utf8')));
    });
    process.on('error', reject);
  });
}
