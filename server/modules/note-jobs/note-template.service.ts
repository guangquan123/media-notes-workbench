import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
} from '@lark-apaas/fullstack-nestjs-core';
import type { AppDatabase } from '@server/database/database.types';
import { and, desc, eq } from 'drizzle-orm';

import {
  noteTemplateConfigs,
  noteTemplateVersions,
} from '@server/database/schema';
import type {
  NotePromptVersion,
  NoteStyle,
  NoteTemplateConfig,
  NoteTemplateConfigResponse,
} from '@shared/api.interface';
import { DEFAULT_NOTE_TEMPLATES } from './note-template.defaults';
import { getNextPromptVersionNumber } from './note-template.utils';

interface TemplateRow {
  activeVersionId: string | null;
  content: string;
  draftContent: string | null;
  noteStyle: string;
  updatedAt: Date;
}

interface PromptVersionRow {
  content: string;
  id: string;
  noteStyle: string;
  publishedAt: Date;
  versionNumber: number;
}

export interface ActivePromptSnapshot {
  content: string;
  versionId: string | null;
  versionNumber: number | null;
}

const NOTE_STYLES: readonly NoteStyle[] = ['learning', 'meeting'];
const MAX_TEMPLATE_LENGTH = 60000;
const HISTORY_LIMIT = 30;

@Injectable()
export class NoteTemplateService {
  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: AppDatabase,
  ) {}

  async list(ownerId: string): Promise<NoteTemplateConfigResponse> {
    const [templates, versions] = await Promise.all([
      this.getTemplateRows(ownerId),
      this.getVersionRows(ownerId),
    ]);
    const items: NoteTemplateConfig[] = NOTE_STYLES.map(
      (style: NoteStyle): NoteTemplateConfig => {
        const stored: TemplateRow | undefined = templates.find(
          (row: TemplateRow) => row.noteStyle === style,
        );
        const history: NotePromptVersion[] = versions
          .filter((row: PromptVersionRow) => row.noteStyle === style)
          .map((row: PromptVersionRow): NotePromptVersion => ({
            content: row.content,
            id: row.id,
            publishedAt: row.publishedAt.toISOString(),
            versionNumber: row.versionNumber,
          }));
        const defaults = DEFAULT_NOTE_TEMPLATES[style];
        const publishedContent: string = stored?.content || defaults.content;
        const activeVersion: NotePromptVersion | undefined = history.find(
          (version: NotePromptVersion) => version.id === stored?.activeVersionId,
        );
        return {
          activeVersionId: stored?.activeVersionId || undefined,
          activeVersionNumber: activeVersion?.versionNumber,
          content: stored?.draftContent || publishedContent,
          description: defaults.description,
          draftContent: stored?.draftContent || publishedContent,
          history,
          isDefault: !stored,
          label: defaults.label,
          publishedContent,
          style,
          updatedAt: stored?.updatedAt.toISOString(),
        };
      },
    );
    return { items };
  }

  async getActivePrompt(
    ownerId: string,
    style: NoteStyle,
  ): Promise<ActivePromptSnapshot> {
    const rows: TemplateRow[] = await this.getTemplateRows(ownerId, style);
    const stored: TemplateRow | undefined = rows[0];
    if (!stored) {
      return {
        content: DEFAULT_NOTE_TEMPLATES[style].content,
        versionId: null,
        versionNumber: null,
      };
    }
    const versions: PromptVersionRow[] = await this.getVersionRows(
      ownerId,
      style,
    );
    const active: PromptVersionRow | undefined = versions.find(
      (version: PromptVersionRow) => version.id === stored.activeVersionId,
    );
    return {
      content: stored.content,
      versionId: active?.id || null,
      versionNumber: active?.versionNumber || null,
    };
  }

  async saveDraft(
    ownerId: string,
    style: NoteStyle,
    content: string,
  ): Promise<NoteTemplateConfig> {
    const normalizedContent: string = this.normalizeContent(content);
    const rows: TemplateRow[] = await this.getTemplateRows(ownerId, style);
    const stored: TemplateRow | undefined = rows[0];
    if (stored) {
      await this.db
        .update(noteTemplateConfigs)
        .set({ draftContent: normalizedContent, updatedAt: new Date() })
        .where(
          and(
            eq(noteTemplateConfigs.ownerId, ownerId),
            eq(noteTemplateConfigs.noteStyle, style),
          ),
        );
    } else {
      await this.db.insert(noteTemplateConfigs).values({
        content: DEFAULT_NOTE_TEMPLATES[style].content,
        draftContent: normalizedContent,
        noteStyle: style,
        ownerId,
      });
    }
    return this.getConfig(ownerId, style);
  }

  async publish(ownerId: string, style: NoteStyle): Promise<NoteTemplateConfig> {
    const rows: TemplateRow[] = await this.getTemplateRows(ownerId, style);
    const stored: TemplateRow | undefined = rows[0];
    const content: string = this.normalizeContent(
      stored?.draftContent || stored?.content || DEFAULT_NOTE_TEMPLATES[style].content,
    );
    const versions: PromptVersionRow[] = await this.getVersionRows(
      ownerId,
      style,
    );
    const latestVersion: PromptVersionRow | undefined = versions[0];
    const versionNumber: number = getNextPromptVersionNumber(
      latestVersion?.versionNumber || null,
    );
    const inserted = await this.db
      .insert(noteTemplateVersions)
      .values({ content, noteStyle: style, ownerId, versionNumber })
      .returning({ id: noteTemplateVersions.id });
    const versionId: string | undefined = inserted[0]?.id;
    if (!versionId) throw new BadRequestException('提示词版本发布失败，请重试');
    if (stored) {
      await this.db
        .update(noteTemplateConfigs)
        .set({
          activeVersionId: versionId,
          content,
          draftContent: content,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(noteTemplateConfigs.ownerId, ownerId),
            eq(noteTemplateConfigs.noteStyle, style),
          ),
        );
    } else {
      await this.db.insert(noteTemplateConfigs).values({
        activeVersionId: versionId,
        content,
        draftContent: content,
        noteStyle: style,
        ownerId,
      });
    }
    return this.getConfig(ownerId, style);
  }

  private async getConfig(
    ownerId: string,
    style: NoteStyle,
  ): Promise<NoteTemplateConfig> {
    const response: NoteTemplateConfigResponse = await this.list(ownerId);
    const config: NoteTemplateConfig | undefined = response.items.find(
      (item: NoteTemplateConfig) => item.style === style,
    );
    if (!config) throw new BadRequestException('提示词配置不存在');
    return config;
  }

  private async getTemplateRows(
    ownerId: string,
    style?: NoteStyle,
  ): Promise<TemplateRow[]> {
    const query = this.db
      .select({
        activeVersionId: noteTemplateConfigs.activeVersionId,
        content: noteTemplateConfigs.content,
        draftContent: noteTemplateConfigs.draftContent,
        noteStyle: noteTemplateConfigs.noteStyle,
        updatedAt: noteTemplateConfigs.updatedAt,
      })
      .from(noteTemplateConfigs)
      .where(
        style
          ? and(
              eq(noteTemplateConfigs.ownerId, ownerId),
              eq(noteTemplateConfigs.noteStyle, style),
            )
          : eq(noteTemplateConfigs.ownerId, ownerId),
      );
    return query;
  }

  private async getVersionRows(
    ownerId: string,
    style?: NoteStyle,
  ): Promise<PromptVersionRow[]> {
    const query = this.db
      .select({
        content: noteTemplateVersions.content,
        id: noteTemplateVersions.id,
        noteStyle: noteTemplateVersions.noteStyle,
        publishedAt: noteTemplateVersions.publishedAt,
        versionNumber: noteTemplateVersions.versionNumber,
      })
      .from(noteTemplateVersions)
      .where(
        style
          ? and(
              eq(noteTemplateVersions.ownerId, ownerId),
              eq(noteTemplateVersions.noteStyle, style),
            )
          : eq(noteTemplateVersions.ownerId, ownerId),
      )
      .orderBy(desc(noteTemplateVersions.versionNumber))
      .limit(HISTORY_LIMIT * NOTE_STYLES.length);
    return query;
  }

  private normalizeContent(content: string): string {
    const normalizedContent: string = content.trim();
    if (!normalizedContent) throw new BadRequestException('模板内容不能为空');
    if (normalizedContent.length > MAX_TEMPLATE_LENGTH) {
      throw new BadRequestException(
        `模板内容不能超过 ${MAX_TEMPLATE_LENGTH} 个字符`,
      );
    }
    return normalizedContent;
  }
}
