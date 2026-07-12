import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, eq } from 'drizzle-orm';

import { noteTemplateConfigs } from '@server/database/schema';
import type {
  NoteStyle,
  NoteTemplateConfig,
  NoteTemplateConfigResponse,
} from '@shared/api.interface';
import { DEFAULT_NOTE_TEMPLATES } from './note-template.defaults';

interface TemplateRow {
  content: string;
  noteStyle: string;
  updatedAt: Date;
}

const NOTE_STYLES: readonly NoteStyle[] = ['learning', 'meeting'];
const MAX_TEMPLATE_LENGTH = 8000;

@Injectable()
export class NoteTemplateService {
  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
  ) {}

  async list(ownerId: string): Promise<NoteTemplateConfigResponse> {
    const rows: TemplateRow[] = await this.db
      .select({
        content: noteTemplateConfigs.content,
        noteStyle: noteTemplateConfigs.noteStyle,
        updatedAt: noteTemplateConfigs.updatedAt,
      })
      .from(noteTemplateConfigs)
      .where(eq(noteTemplateConfigs.ownerId, ownerId));
    const items: NoteTemplateConfig[] = NOTE_STYLES.map(
      (style: NoteStyle): NoteTemplateConfig => {
        const stored: TemplateRow | undefined = rows.find(
          (row: TemplateRow) => row.noteStyle === style,
        );
        const defaultTemplate = DEFAULT_NOTE_TEMPLATES[style];
        return {
          style,
          label: defaultTemplate.label,
          description: defaultTemplate.description,
          content: stored?.content || defaultTemplate.content,
          isDefault: !stored,
          updatedAt: stored?.updatedAt.toISOString(),
        };
      },
    );
    return { items };
  }

  async getContent(ownerId: string, style: NoteStyle): Promise<string> {
    const result: TemplateRow[] = await this.db
      .select({
        content: noteTemplateConfigs.content,
        noteStyle: noteTemplateConfigs.noteStyle,
        updatedAt: noteTemplateConfigs.updatedAt,
      })
      .from(noteTemplateConfigs)
      .where(
        and(
          eq(noteTemplateConfigs.ownerId, ownerId),
          eq(noteTemplateConfigs.noteStyle, style),
        ),
      )
      .limit(1);
    return result[0]?.content || DEFAULT_NOTE_TEMPLATES[style].content;
  }

  async update(
    ownerId: string,
    style: NoteStyle,
    content: string,
  ): Promise<NoteTemplateConfig> {
    const normalizedContent: string = content.trim();
    if (!normalizedContent) {
      throw new BadRequestException('模板内容不能为空');
    }
    if (normalizedContent.length > MAX_TEMPLATE_LENGTH) {
      throw new BadRequestException('模板内容不能超过 8000 个字符');
    }
    await this.db
      .insert(noteTemplateConfigs)
      .values({
        ownerId,
        noteStyle: style,
        content: normalizedContent,
      })
      .onConflictDoUpdate({
        target: [noteTemplateConfigs.ownerId, noteTemplateConfigs.noteStyle],
        set: {
          content: normalizedContent,
          updatedAt: new Date(),
        },
      });
    const defaults = DEFAULT_NOTE_TEMPLATES[style];
    return {
      style,
      label: defaults.label,
      description: defaults.description,
      content: normalizedContent,
      isDefault: false,
      updatedAt: new Date().toISOString(),
    };
  }
}
