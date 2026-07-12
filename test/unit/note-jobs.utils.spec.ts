import { BadRequestException } from '@nestjs/common';

import {
  validateMediaDownloadUrl,
  validateMediaInput,
  validateNoteJobRequest,
  normalizePlatformSourceUrl,
  validatePdfInput,
} from '../../server/modules/note-jobs/note-jobs.utils';

describe('note job request validation', () => {
  const video = {
    downloadUrl: 'https://storage.example.com/uploads/lesson.mp4',
    fileName: 'lesson.mp4',
    fileSize: 32 * 1024 * 1024,
    mimeType: 'video/mp4',
  };

  it('accepts a local video job with safe uploaded media metadata', () => {
    const result = validateNoteJobRequest({
      sourceType: 'video',
      media: video,
    });

    expect(result.sourceType).toBe('video');
    expect(result.media.fileName).toBe('lesson.mp4');
    expect(result.noteStyle).toBe('systematic');
  });

  it.each(['systematic', 'concise', 'actionable', 'meeting'] as const)(
    'accepts the %s note style',
    (noteStyle) => {
      const result = validateNoteJobRequest({
        sourceType: 'video',
        media: video,
        noteStyle,
      });

      expect(result.noteStyle).toBe(noteStyle);
    },
  );

  it('rejects unsupported note styles', () => {
    expect(() =>
      validateNoteJobRequest({
        sourceType: 'video',
        media: video,
        noteStyle: 'marketing',
      }),
    ).toThrow('不支持的笔记风格');
  });

  it('rejects audio MIME types for a local video job', () => {
    expect(() =>
      validateMediaInput({ ...video, mimeType: 'audio/mpeg' }, 'video'),
    ).toThrow(BadRequestException);
  });

  it('rejects files larger than the configured media limit', () => {
    expect(() =>
      validateMediaInput(
        { ...video, fileSize: 1024 * 1024 * 1024 + 1 },
        'video',
      ),
    ).toThrow('文件不能超过 1 GB');
  });

  it('rejects non-HTTPS and private download URLs', () => {
    expect(() =>
      validateMediaInput(
        { ...video, downloadUrl: 'http://127.0.0.1/private.mp4' },
        'video',
      ),
    ).toThrow('文件下载地址不安全');
  });

  it('rejects a redirected media URL that points to a private host', () => {
    expect(() =>
      validateMediaDownloadUrl('https://localhost/internal-audio.mp3'),
    ).toThrow('文件下载地址不安全');
  });

  it('requires media metadata for audio jobs', () => {
    expect(() => validateNoteJobRequest({ sourceType: 'audio' })).toThrow(
      '请选择需要处理的录音文件',
    );
  });

  it('accepts an uploaded PDF with safe metadata', () => {
    const result = validateNoteJobRequest({
      sourceType: 'pdf',
      media: {
        downloadUrl: 'https://storage.example.com/uploads/governance.pdf',
        fileName: 'governance.pdf',
        fileSize: 8 * 1024 * 1024,
        mimeType: 'application/pdf',
      },
    });

    expect(result.sourceType).toBe('pdf');
    expect(result.media.fileName).toBe('governance.pdf');
  });

  it('rejects a non-PDF file for a PDF job', () => {
    expect(() =>
      validatePdfInput({
        downloadUrl: 'https://storage.example.com/uploads/governance.docx',
        fileName: 'governance.docx',
        fileSize: 8 * 1024 * 1024,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toThrow('请选择有效的 PDF 文件');
  });

  it('extracts the Bilibili URL from a share text payload', () => {
    const result = normalizePlatformSourceUrl(
      '【Codex联动Obsidian，搭建卡帕西同款知识库，手把手教程】https://www.bilibili.com/video/BV1MJVb6cETR?vd_source=f7e989348f5babe743827751dbe46aef',
      'bilibili',
    );

    expect(result).toBe(
      'https://www.bilibili.com/video/BV1MJVb6cETR?vd_source=f7e989348f5babe743827751dbe46aef',
    );
  });
});
