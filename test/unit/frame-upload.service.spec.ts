import { buildFrameUploadCommand } from '../../server/modules/note-jobs/frame-upload.service';

describe('buildFrameUploadCommand', () => {
  it('runs lark-cli beside the frame and passes only a relative file name', () => {
    const command = buildFrameUploadCommand(
      '/private/tmp/video-note-123/frames-2/candidate_000004.png',
    );

    expect(command.cwd).toBe('/private/tmp/video-note-123/frames-2');
    expect(command.args).toContain('image=candidate_000004.png');
    expect(command.args).not.toContain(
      'image=/private/tmp/video-note-123/frames-2/candidate_000004.png',
    );
  });

  it('keeps the working user identity that has upload permission', () => {
    const command = buildFrameUploadCommand(
      '/private/tmp/video-note-123/frames-0/candidate_000001.png',
    );

    expect(command.args).toEqual(expect.arrayContaining(['--as', 'user']));
  });
});
