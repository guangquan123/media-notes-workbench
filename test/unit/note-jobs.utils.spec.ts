import { BadRequestException } from '@nestjs/common';

import {
  validateMediaDownloadUrl,
  validateMediaInput,
  validateNoteJobRequest,
  normalizePlatformSourceUrl,
  validateDocumentInput,
  getDouyinAudioFallbackArgs,
  getMediaDownloadConcurrency,
  isInterruptedProcessingStage,
  isDouyinTransientMediaError,
  isAudioRematrixError,
} from '../../server/modules/note-jobs/note-jobs.utils';
import { DEFAULT_NOTE_TEMPLATES } from '../../server/modules/note-jobs/note-template.defaults';

describe('note job request validation', () => {
  const video = {
    downloadUrl: 'https://storage.example.com/uploads/lesson.mp4',
    fileName: 'lesson.mp4',
    fileSize: 32 * 1024 * 1024,
    mimeType: 'video/mp4',
  };
  const audio = {
    downloadUrl: 'https://storage.example.com/uploads/lesson.m4a',
    fileName: 'lesson.m4a',
    fileSize: 16 * 1024 * 1024,
    mimeType: 'audio/mp4',
  };

  it('accepts a paired video and auxiliary audio job', () => {
    const result = validateNoteJobRequest({
      sourceType: 'paired',
      noteStyle: 'meeting',
      pairedMedia: {
        video,
        auxiliaryAudio: audio,
        alignment: { mode: 'auto' },
      },
    });

    expect(result.sourceType).toBe('paired');
    expect(
      result.sourceType === 'paired' &&
        result.pairedMedia.auxiliaryAudio.fileName,
    ).toBe('lesson.m4a');
  });

  it('rejects paired jobs when the auxiliary source is not audio', () => {
    expect(() =>
      validateNoteJobRequest({
        sourceType: 'paired',
        pairedMedia: {
          video,
          auxiliaryAudio: video,
          alignment: { mode: 'auto' },
        },
      }),
    ).toThrow('辅助录音');
  });

  it('accepts a bounded manual alignment offset', () => {
    const result = validateNoteJobRequest({
      sourceType: 'paired',
      pairedMedia: {
        video,
        auxiliaryAudio: audio,
        alignment: {
          mode: 'manual',
          audioOffsetMs: 30_000,
        },
      },
    });

    expect(
      result.sourceType === 'paired' &&
        result.pairedMedia.alignment.audioOffsetMs,
    ).toBe(30_000);
  });

  it('rejects a manual alignment without a finite offset', () => {
    expect(() =>
      validateNoteJobRequest({
        sourceType: 'paired',
        pairedMedia: {
          video,
          auxiliaryAudio: audio,
          alignment: { mode: 'manual' },
        },
      }),
    ).toThrow('手动时间偏移');
  });

  it('accepts a local video job with safe uploaded media metadata', () => {
    const result = validateNoteJobRequest({
      sourceType: 'video',
      media: video,
    });

    expect(result.sourceType).toBe('video');
    expect(result.sourceType === 'video' && result.mediaItems[0].fileName).toBe(
      'lesson.mp4',
    );
    expect(result.noteStyle).toBe('learning');
    expect(result.visualOptions).toEqual({ mode: 'disabled' });
  });

  it.each(['learning', 'meeting'] as const)(
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
        noteStyle: 'systematic',
      }),
    ).toThrow('不支持的笔记风格');
  });

  it('provides editable default templates for learning and meeting notes', () => {
    expect(DEFAULT_NOTE_TEMPLATES.learning.content).toContain('知识框架');
    expect(DEFAULT_NOTE_TEMPLATES.meeting.content).toContain('待办');
  });

  it('rejects audio MIME types for a local video job', () => {
    expect(() =>
      validateMediaInput({ ...video, mimeType: 'audio/mpeg' }, 'video'),
    ).toThrow(BadRequestException);
  });

  it('accepts media files up to 10 GiB', () => {
    expect(() =>
      validateMediaInput(
        { ...video, fileSize: 10 * 1024 * 1024 * 1024 },
        'video',
      ),
    ).not.toThrow();
  });

  it('accepts up to 10 videos when their combined size is within 10 GiB', () => {
    const mediaItems = Array.from(
      { length: 10 },
      (_: unknown, index: number) => ({
        ...video,
        downloadUrl: `https://storage.example.com/uploads/lesson-${index}.mp4`,
        fileSize: 1024,
      }),
    );

    expect(() =>
      validateNoteJobRequest({ sourceType: 'video', mediaItems }),
    ).not.toThrow();
  });

  it('rejects more than 10 videos in one job', () => {
    const mediaItems = Array.from(
      { length: 11 },
      (_: unknown, index: number) => ({
        ...video,
        downloadUrl: `https://storage.example.com/uploads/lesson-${index}.mp4`,
        fileSize: 1024,
      }),
    );

    expect(() =>
      validateNoteJobRequest({ sourceType: 'video', mediaItems }),
    ).toThrow('一次最多处理 10 个视频');
  });

  it('rejects videos whose combined size exceeds 10 GiB', () => {
    const mediaItems = [
      { ...video, fileSize: 6 * 1024 * 1024 * 1024 },
      {
        ...video,
        downloadUrl: 'https://storage.example.com/uploads/lesson-2.mp4',
        fileSize: 5 * 1024 * 1024 * 1024,
      },
    ];

    expect(() =>
      validateNoteJobRequest({ sourceType: 'video', mediaItems }),
    ).toThrow('所有视频累计不能超过 10 GB');
  });

  it('rejects chunked media when the part sizes do not match the file size', () => {
    expect(() =>
      validateMediaInput(
        {
          ...video,
          fileSize: 1024,
          parts: [
            {
              downloadUrl: 'https://storage.example.com/uploads/lesson.part-1',
              fileSize: 512,
            },
            {
              downloadUrl: 'https://storage.example.com/uploads/lesson.part-2',
              fileSize: 256,
            },
          ],
        },
        'video',
      ),
    ).toThrow('上传分片大小与文件大小不一致');
  });

  it('accepts up to 80 media parts for a 10 GiB upload', () => {
    const parts: { downloadUrl: string; fileSize: number }[] = Array.from(
      { length: 80 },
      (_: unknown, index: number) => ({
        downloadUrl: `https://storage.example.com/uploads/lesson.part-${index}`,
        fileSize: 128,
      }),
    );

    expect(() =>
      validateMediaInput({ ...video, fileSize: 80 * 128, parts }, 'video'),
    ).not.toThrow();
  });

  it('rejects files larger than 10 GiB', () => {
    expect(() =>
      validateMediaInput(
        { ...video, fileSize: 10 * 1024 * 1024 * 1024 + 1 },
        'video',
      ),
    ).toThrow('文件不能超过 10 GB');
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

  it('accepts an uploaded document with safe metadata', () => {
    const result = validateNoteJobRequest({
      sourceType: 'document',
      media: {
        downloadUrl: 'https://storage.example.com/uploads/governance.pdf',
        fileName: 'governance.pdf',
        fileSize: 8 * 1024 * 1024,
        mimeType: 'application/pdf',
      },
    });

    expect(result.sourceType).toBe('document');
    expect(
      result.sourceType === 'document' && result.mediaItems[0].fileName,
    ).toBe('governance.pdf');
  });

  it('accepts multiple Word and PowerPoint files for one document note', () => {
    const result = validateNoteJobRequest({
      sourceType: 'document',
      mediaItems: [
        {
          downloadUrl: 'https://storage.example.com/uploads/guide.docx',
          fileName: 'guide.docx',
          fileSize: 1024,
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        {
          downloadUrl: 'https://storage.example.com/uploads/training.pptx',
          fileName: 'training.pptx',
          fileSize: 1024,
          mimeType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      ],
    });

    expect(result.sourceType === 'document' && result.mediaItems.length).toBe(
      2,
    );
  });

  it('rejects unsupported files for a document job', () => {
    expect(() =>
      validateDocumentInput({
        downloadUrl: 'https://storage.example.com/uploads/recording.mp3',
        fileName: 'recording.mp3',
        fileSize: 8 * 1024 * 1024,
        mimeType: 'audio/mpeg',
      }),
    ).toThrow('仅支持 PDF、Word 和 PowerPoint 文档');
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

  it('uses an explicit stereo pan when Douyin audio metadata is invalid', () => {
    expect(getDouyinAudioFallbackArgs()).toEqual([
      '-filter:a',
      'pan=stereo|c0=c0|c1=c1',
      '-ar',
      '16000',
    ]);
  });

  it('only retries Douyin extraction for channel rematrix failures', () => {
    expect(
      isAudioRematrixError('Rematrix is needed between 42 channels and stereo'),
    ).toBe(true);
    expect(isAudioRematrixError('HTTP error 403')).toBe(false);
  });

  it('retries a Douyin stream when the upstream TLS connection closes', () => {
    expect(
      isDouyinTransientMediaError(
        '[tls] IO error: End of file\nError opening input files: End of file',
      ),
    ).toBe(true);
    expect(isDouyinTransientMediaError('HTTP 403 Forbidden')).toBe(false);
  });
});

describe('note job runtime safeguards', () => {
  it('uses up to four concurrent workers for multipart media downloads', () => {
    expect(getMediaDownloadConcurrency(1)).toBe(1);
    expect(getMediaDownloadConcurrency(2)).toBe(2);
    expect(getMediaDownloadConcurrency(38)).toBe(4);
  });

  it('rejects invalid media part counts', () => {
    expect(() => getMediaDownloadConcurrency(0)).toThrow(
      '媒体分片数必须是正整数',
    );
  });

  it('distinguishes restart-interrupted stages from durable stages', () => {
    expect(isInterruptedProcessingStage('preparing')).toBe(true);
    expect(isInterruptedProcessingStage('transcribing')).toBe(true);
    expect(isInterruptedProcessingStage('awaiting-frame-review')).toBe(false);
    expect(isInterruptedProcessingStage('completed')).toBe(false);
    expect(isInterruptedProcessingStage('failed')).toBe(false);
  });
});
