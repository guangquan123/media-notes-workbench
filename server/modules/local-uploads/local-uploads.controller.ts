import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import {
  resolveByteRange,
  type ByteRange,
} from './local-uploads.utils';

const uploadsDir = join(process.cwd(), 'data', 'uploads');

interface MulterFile {
  filename: string;
  originalname: string;
  size: number;
  mimetype: string;
}

interface LocalUploadResult {
  id: string;
  url: string;
  fileSize: number;
  fileName: string;
}

@Controller('api/local-uploads')
export class LocalUploadsController {
  constructor() {
    mkdirSync(uploadsDir, { recursive: true });
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadsDir,
        filename: (_req, _file, cb) => cb(null, randomUUID()),
      }),
    }),
  )
  upload(@UploadedFile() file: MulterFile | undefined): LocalUploadResult {
    if (!file) throw new Error('missing file');
    const port = process.env.SERVER_PORT || '3000';
    return {
      id: file.filename,
      url: 'http://localhost:' + port + '/api/local-uploads/' + file.filename,
      fileSize: file.size,
      fileName: file.originalname,
    };
  }

  @Get(':id')
  download(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const filePath = join(uploadsDir, id);
    if (!existsSync(filePath)) {
      res.status(404).send('not found');
      return;
    }
    const fileSize: number = statSync(filePath).size;
    const range: string | undefined = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/octet-stream');
    if (!range) {
      res.setHeader('Content-Length', fileSize);
      createReadStream(filePath).pipe(res);
      return;
    }

    const resolvedRange: ByteRange | null = resolveByteRange(range, fileSize);
    if (!resolvedRange) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).send();
      return;
    }
    const { end, start } = resolvedRange;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(filePath, { start, end }).pipe(res);
  }
}
