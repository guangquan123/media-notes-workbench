/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const noteInboxMessages = pgTable("note_inbox_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  bindingId: uuid("binding_id").notNull(),
  mediaId: uuid("media_id"),
  ownerId: varchar("owner_id", { length: 255 }).notNull(),
  messageId: varchar("message_id", { length: 255 }).notNull(),
  senderLarkUserId: varchar("sender_lark_user_id", { length: 255 }),
  messageContent: text("message_content").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  originalUrl: text("original_url"),
  platform: varchar("platform", { length: 32 }),
  status: varchar("status", { length: 32 }).notNull(),
  statusReason: varchar("status_reason", { length: 512 }),
  messageCreatedAt: customTimestamptz("message_created_at", { precision: 6 }),
  duplicateOfMessageId: varchar("duplicate_of_message_id", { length: 255 }),
  createdAt: customTimestamptz("created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: customTimestamptz("updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("note_inbox_messages_binding_message_key").on(table.bindingId, table.messageId),
  index("note_inbox_messages_owner_created_idx").on(table.ownerId, table.messageCreatedAt, table.id),
  index("note_inbox_messages_owner_status_created_idx").on(table.ownerId, table.status, table.messageCreatedAt),
  foreignKey({
    columns: [table.bindingId],
    foreignColumns: [noteInboxBindings.id],
    name: "note_inbox_messages_binding_id_fkey",
  }),
  foreignKey({
    columns: [table.mediaId],
    foreignColumns: [noteInboxMedia.id],
    name: "note_inbox_messages_media_id_fkey",
  }),
]);

export const noteInboxMedia = pgTable("note_inbox_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: varchar("owner_id", { length: 255 }).notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  canonicalKey: varchar("canonical_key", { length: 1024 }).notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull().default('QUEUED'),
  jobId: uuid("job_id").unique(),
  noteStyle: varchar("note_style", { length: 32 }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  createdAt: customTimestamptz("created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: customTimestamptz("updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("note_inbox_media_job_id_key").on(table.jobId),
  uniqueIndex("note_inbox_media_owner_source_key").on(table.ownerId, table.platform, table.canonicalKey),
  index("note_inbox_media_owner_status_created_idx").on(table.ownerId, table.status, table.createdAt),
]);

export const noteInboxBindings = pgTable("note_inbox_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: varchar("owner_id", { length: 255 }).notNull().unique(),
  chatId: varchar("chat_id", { length: 255 }).notNull(),
  larkUserId: varchar("lark_user_id", { length: 255 }).notNull(),
  noteStyle: varchar("note_style", { length: 32 }).notNull().default('learning'),
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastSyncedAt: customTimestamptz("last_synced_at", { precision: 6 }),
  lastSyncError: text("last_sync_error"),
  createdAt: customTimestamptz("created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: customTimestamptz("updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("note_inbox_bindings_owner_id_key").on(table.ownerId),
  uniqueIndex("note_inbox_bindings_owner_chat_key").on(table.ownerId, table.chatId),
]);

export const noteTemplateVersions = pgTable("note_template_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: userProfile("owner_id").notNull(),
  noteStyle: varchar("note_style", { length: 32 }).notNull(),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  publishedAt: customTimestamptz("published_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: customTimestamptz("created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("note_template_versions_owner_id_note_style_version_number_key").on(table.ownerId, table.noteStyle, table.versionNumber),
  index("note_template_versions_owner_style_idx").on(table.ownerId, table.noteStyle, table.versionNumber),
]);

export const noteTemplateConfigs = pgTable("note_template_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: userProfile("owner_id").notNull(),
  noteStyle: varchar("note_style", { length: 32 }).notNull(),
  content: text("content").notNull(),
  createdAt: customTimestamptz("created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: customTimestamptz("updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  draftContent: text("draft_content"),
  activeVersionId: uuid("active_version_id"),
}, (table) => [
  uniqueIndex("note_template_configs_owner_style_key").on(table.ownerId, table.noteStyle),
  index("note_template_configs_owner_idx").on(table.ownerId),
]);

export const noteConversionRecords = pgTable("note_conversion_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().unique(),
  ownerId: userProfile("owner_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  sourceLabel: varchar("source_label", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  durationMs: integer("duration_ms"),
  startedAt: customTimestamptz("started_at", { precision: 6 }).notNull(),
  completedAt: customTimestamptz("completed_at", { precision: 6 }),
  documentUrl: text("document_url"),
  error: text("error"),
  rawDocumentUrl: text("raw_document_url"),
  rawTranscript: text("raw_transcript"),
  noteStyle: varchar("note_style", { length: 32 }),
  promptVersionId: uuid("prompt_version_id"),
  promptContent: text("prompt_content"),
  processingStatus: varchar("processing_status", { length: 32 }).notNull().default('pending'),
  processedAt: customTimestamptz("processed_at", { precision: 6 }),
  larkTaskGuid: varchar("lark_task_guid", { length: 255 }),
  larkTaskUrl: text("lark_task_url"),
  taskSyncStatus: varchar("task_sync_status", { length: 32 }).notNull().default('not_created'),
  taskSyncError: text("task_sync_error"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("note_conversion_records_job_id_key").on(table.jobId),
  index("note_conversion_records_owner_completed_idx").on(table.ownerId, table.completedAt, table.startedAt),
  index("note_conversion_records_owner_processing_idx").on(table.ownerId, table.processingStatus, table.startedAt),
]);

// table aliases
export const noteConversionRecordsTable = noteConversionRecords;
export const noteInboxBindingsTable = noteInboxBindings;
export const noteInboxMediaTable = noteInboxMedia;
export const noteInboxMessagesTable = noteInboxMessages;
export const noteTemplateConfigsTable = noteTemplateConfigs;
export const noteTemplateVersionsTable = noteTemplateVersions;
