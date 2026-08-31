import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import type { AppDatabase } from '@server/database/database.types';
import { and, desc, eq, ne } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import { runBackgroundTask } from '../../common/utils/background-task';
import { getCliEnvironment, resolveCliInvocation } from '../../common/utils/cli-command';
import { noteConversionRecords, noteInboxBindings, noteInboxMedia, noteInboxMessages } from '@server/database/schema';
import type { InboxMessageStatus, NoteInboxMessageListResponse, NoteInboxStatus, NoteStyle, SourcePlatform } from '@shared/api.interface';
import { NoteJobsService } from '../note-jobs/note-jobs.service';
import { buildInboxSubject, classifyInboxLink, summarizeInboxMessages } from './note-inbox-ledger.utils';
import {
  extractSupportedPlatformUrl,
  isValidInboxChatId,
  parseInboxMessages,
} from './note-inbox.utils';

const POLL_INTERVAL_MS = 30_000;
@Injectable()
export class NoteInboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoteInboxService.name); private pollTimer?: NodeJS.Timeout; private polling = false;
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: AppDatabase, private readonly noteJobsService: NoteJobsService) {}
  async onModuleInit(): Promise<void> {
    this.pollTimer = setInterval(
      () => this.syncInBackground(),
      POLL_INTERVAL_MS,
    );
    this.pollTimer.unref();
    this.syncInBackground();
  }
  onModuleDestroy(): void { if (this.pollTimer) clearInterval(this.pollTimer); }
  async getStatus(ownerId: string): Promise<NoteInboxStatus> {
    const binding = await this.getBinding(ownerId); if (!binding) return { configured: false, seenCount: 0 };
    const list = await this.listMessages(ownerId); return { chatId: binding.chatId, configured: binding.isEnabled, lastError: binding.lastSyncError || undefined, lastSyncedAt: binding.lastSyncedAt?.toISOString(), seenCount: list.summary.totalMessages, summary: list.summary };
  }
  async configure(input: { chatId: string; larkUserId: string; noteStyle: NoteStyle; ownerId: string }): Promise<NoteInboxStatus> {
    if (!isValidInboxChatId(input.chatId)) throw new Error('会话 ID 格式无效，应以 oc_ 开头');
    await this.db.insert(noteInboxBindings).values({ chatId: input.chatId, larkUserId: input.larkUserId, noteStyle: input.noteStyle, ownerId: input.ownerId, isEnabled: true }).onConflictDoUpdate({ target: noteInboxBindings.ownerId, set: { chatId: input.chatId, larkUserId: input.larkUserId, noteStyle: input.noteStyle, isEnabled: true, lastSyncError: null, updatedAt: new Date() } });
    await this.sync(); return this.getStatus(input.ownerId);
  }
  async listMessages(ownerId: string): Promise<NoteInboxMessageListResponse> {
    const rows = await this.db.select({ id: noteInboxMessages.id, messageId: noteInboxMessages.messageId, subject: noteInboxMessages.subject, originalUrl: noteInboxMessages.originalUrl, platform: noteInboxMessages.platform, status: noteInboxMessages.status, statusReason: noteInboxMessages.statusReason, messageCreatedAt: noteInboxMessages.messageCreatedAt, duplicateOfMessageId: noteInboxMessages.duplicateOfMessageId, jobId: noteInboxMedia.jobId, mediaTitle: noteInboxMedia.title, conversionStatus: noteConversionRecords.status }).from(noteInboxMessages).leftJoin(noteInboxMedia, eq(noteInboxMessages.mediaId, noteInboxMedia.id)).leftJoin(noteConversionRecords, eq(noteInboxMedia.jobId, noteConversionRecords.jobId)).where(and(eq(noteInboxMessages.ownerId, ownerId), ne(noteInboxMessages.status, 'IGNORED'))).orderBy(desc(noteInboxMessages.messageCreatedAt), desc(noteInboxMessages.id)).limit(100);
    const items = rows.map((row) => ({ ...row, platform: row.platform as SourcePlatform | null, status: row.status === 'DUPLICATE' ? 'DUPLICATE' : row.conversionStatus === 'completed' ? 'SUCCEEDED' : row.conversionStatus === 'failed' ? 'FAILED' : row.status as InboxMessageStatus, messageCreatedAt: row.messageCreatedAt?.toISOString() || null }));
    return { items, summary: summarizeInboxMessages(items) };
  }
  async sync(): Promise<void> {
    if (this.polling) return; this.polling = true;
    try { const bindings = await this.db.select().from(noteInboxBindings).where(eq(noteInboxBindings.isEnabled, true)); for (const binding of bindings) await this.syncBinding(binding); }
    finally { this.polling = false; }
  }
  private syncInBackground(): void {
    runBackgroundTask(
      () => this.sync(),
      (error: unknown): void => {
        const details: string =
          error instanceof Error ? error.stack || error.message : String(error);
        this.logger.error(`飞书收件箱后台同步失败: ${details}`);
      },
    );
  }
  private async syncBinding(binding: typeof noteInboxBindings.$inferSelect): Promise<void> {
    try { const messages = await this.fetchMessages(binding.chatId); for (const message of messages) await this.recordMessage(binding, message); await this.db.update(noteInboxBindings).set({ lastSyncedAt: new Date(), lastSyncError: null, updatedAt: new Date() }).where(eq(noteInboxBindings.id, binding.id)); }
    catch (error) { const lastSyncError = error instanceof Error ? error.message.slice(0, 4000) : '收件箱同步失败'; await this.db.update(noteInboxBindings).set({ lastSyncError, updatedAt: new Date() }).where(eq(noteInboxBindings.id, binding.id)); this.logger.error(`飞书收件箱同步失败: ${lastSyncError}`); }
  }
  private async recordMessage(binding: typeof noteInboxBindings.$inferSelect, message: { messageId: string; content: string }): Promise<void> {
    const exists = await this.db.select({ id: noteInboxMessages.id }).from(noteInboxMessages).where(and(eq(noteInboxMessages.bindingId, binding.id), eq(noteInboxMessages.messageId, message.messageId))).limit(1); if (exists[0]) return;
    const url = extractSupportedPlatformUrl(message.content); if (!url) { await this.db.insert(noteInboxMessages).values({ bindingId: binding.id, ownerId: binding.ownerId, messageId: message.messageId, messageContent: message.content.slice(0, 8000), subject: '非支持链接消息', status: 'IGNORED', statusReason: '未检测到 B站或抖音链接' }); return; }
    const link = classifyInboxLink(url); if (!link) return;
    const mediaRows = await this.db.insert(noteInboxMedia).values({ ownerId: binding.ownerId, platform: link.platform, canonicalKey: link.canonicalKey, canonicalUrl: link.canonicalUrl, noteStyle: binding.noteStyle, status: 'QUEUED', attemptCount: 1 }).onConflictDoNothing().returning();
    const media = mediaRows[0] || (await this.db.select().from(noteInboxMedia).where(and(eq(noteInboxMedia.ownerId, binding.ownerId), eq(noteInboxMedia.platform, link.platform), eq(noteInboxMedia.canonicalKey, link.canonicalKey))).limit(1))[0]; if (!media) return;
    const duplicate = mediaRows.length === 0; await this.db.insert(noteInboxMessages).values({ bindingId: binding.id, mediaId: media.id, ownerId: binding.ownerId, messageId: message.messageId, messageContent: message.content.slice(0, 8000), subject: buildInboxSubject(message.content, link.platform), originalUrl: url, platform: link.platform, status: duplicate ? 'DUPLICATE' : 'PROCESSING', statusReason: duplicate ? '已关联到此前收到的同一视频' : null });
    if (!duplicate) { try { const job = await this.noteJobsService.createFromInbox({ noteStyle: binding.noteStyle as NoteStyle, sourcePlatform: link.platform, sourceType: 'platform', url }, binding.ownerId, binding.larkUserId); await this.db.update(noteInboxMedia).set({ jobId: job.id, status: 'PROCESSING', updatedAt: new Date() }).where(eq(noteInboxMedia.id, media.id)); await this.db.update(noteConversionRecords).set({ sourceChannel: 'feishu_inbox' }).where(eq(noteConversionRecords.jobId, job.id)); } catch (error) { await this.db.update(noteInboxMedia).set({ status: 'FAILED', lastError: error instanceof Error ? error.message : '任务创建失败', updatedAt: new Date() }).where(eq(noteInboxMedia.id, media.id)); } }
  }
  private async getBinding(ownerId: string) { return (await this.db.select().from(noteInboxBindings).where(eq(noteInboxBindings.ownerId, ownerId)).limit(1))[0]; }
  private async fetchMessages(chatId: string) { const output = await this.runCommand('lark-cli', ['im', '+chat-messages-list', '--as', 'user', '--chat-id', chatId, '--order', 'asc', '--page-size', '50', '--no-reactions', '--format', 'json']); return parseInboxMessages(JSON.parse(output)); }
  private runCommand(command: string, args: string[]): Promise<string> { return new Promise((resolve, reject) => { const invocation = resolveCliInvocation(command, args); const child = spawn(invocation.command, invocation.args, { cwd: process.cwd(), env: getCliEnvironment(), windowsHide: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = ''; child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); }); child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); }); child.on('error', reject); child.on('close', (code: number | null) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} 执行失败（${code}）`))); }); }
}
