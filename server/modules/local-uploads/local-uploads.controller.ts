import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';

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
  download(@Param('id') id: string, @Res() res: Response): void {
    const filePath = join(uploadsDir, id);
    if (!existsSync(filePath)) {
      res.status(404).send('not found');
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    createReadStream(filePath).pipe(res);
  }
}
