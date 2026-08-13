import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import { parseOffice } from 'officeparser';

@Injectable()
export class LocalDocumentParserService {
  private readonly logger = new Logger(LocalDocumentParserService.name);

  async parsePdf(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text?.trim();
    if (!text) throw new Error("PDF 未抽取到文本，可能为扫描件（需 OCR）。");
    return text;
  }

  async parseOfficeDocument(filePath: string): Promise<string> {
    const ast = await parseOffice(filePath);
    const text = ast.toText().trim();
    if (!text) throw new Error("文档未抽取到文本。");
    return text;
  }
}
