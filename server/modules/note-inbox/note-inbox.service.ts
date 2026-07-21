import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NoteStyle } from '@shared/api.interface';
import { NoteJobsService } from '../note-jobs/note-jobs.service';
import {
  extractSupportedPlatformUrl,
  isValidInboxChatId,
  parseInboxMessages,
} from './note-inbox.utils';

interface InboxBinding {
  readonly chatId: string;
  readonly larkUserId: string;
  readonly noteStyle: NoteStyle;
  readonly ownerId: string;
}

interface InboxState {
  readonly binding?: InboxBinding;
  readonly seenMessageIds: string[];
}

export interface NoteInboxStatus {
  readonly chatId?: string;
  readonly configured: boolean;
  readonly lastError?: string;
  readonly seenCount: number;
}

const POLL_INTERVAL_MS = 30_000;
const MAX_SEEN_MESSAGE_IDS = 500;

@Injectable()
export class NoteInboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoteInboxService.name);
  private readonly statePath = join(process.cwd(), '.media-inbox-state.json');
  private state: InboxState = { seenMessageIds: [] };
  private pollTimer: NodeJS.Timeout | undefined;
  private polling = false;
  private lastError: string | undefined;

  constructor(private readonly noteJobsService: NoteJobsService) {}

  async onModuleInit(): Promise<void> {
    this.state = await this.loadState();
    this.pollTimer = setInterval(() => void this.sync(), POLL_INTERVAL_MS);
    this.pollTimer.unref();
    void this.sync();
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  getStatus(ownerId?: string): NoteInboxStatus {
    if (ownerId && this.state.binding?.ownerId !== ownerId) {
      return { configured: false, seenCount: 0 };
    }
    return {
      chatId: this.state.binding?.chatId,
      configured: Boolean(this.state.binding),
      lastError: this.lastError,
      seenCount: this.state.seenMessageIds.length,
    };
  }

  async configure(input: {
    chatId: string;
    larkUserId: string;
    noteStyle: NoteStyle;
    ownerId: string;
  }): Promise<NoteInboxStatus> {
    if (
      this.state.binding &&
      this.state.binding.ownerId !== input.ownerId
    ) {
      throw new Error('此收集箱已绑定其他用户，无法覆盖');
    }
    if (!isValidInboxChatId(input.chatId)) {
      throw new Error('会话 ID 格式无效，应以 oc_ 开头');
    }
    if (!input.larkUserId) throw new Error('当前账号未关联飞书用户 ID');

    const binding: InboxBinding = {
      chatId: input.chatId,
      larkUserId: input.larkUserId,
      noteStyle: input.noteStyle,
      ownerId: input.ownerId,
    };
    const baselineMessages = await this.listMessages(binding.chatId);
    this.state = {
      binding,
      seenMessageIds: baselineMessages
        .map((message) => message.messageId)
        .slice(-MAX_SEEN_MESSAGE_IDS),
    };
    await this.saveState();
    this.lastError = undefined;
    return this.getStatus(input.ownerId);
  }

  async sync(): Promise<void> {
    if (this.polling || !this.state.binding) return;
    this.polling = true;
    try {
      const binding: InboxBinding = this.state.binding;
      const messages = await this.listMessages(binding.chatId);
      for (const message of messages) {
        if (this.state.seenMessageIds.includes(message.messageId)) continue;
        const url = extractSupportedPlatformUrl(message.content);
        if (!url) {
          await this.markSeen(message.messageId);
          continue;
        }
        const sourcePlatform = url.includes('bilibili.com') || url.includes('b23.tv')
          ? 'bilibili'
          : 'douyin';
        await this.noteJobsService.createFromInbox(
          {
            noteStyle: binding.noteStyle,
            sourcePlatform,
            sourceType: 'platform',
            url,
          },
          binding.ownerId,
          binding.larkUserId,
        );
        await this.markSeen(message.messageId);
      }
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : '收件箱同步失败';
      this.logger.error(`飞书收件箱同步失败: ${this.lastError}`);
    } finally {
      this.polling = false;
    }
  }

  private async markSeen(messageId: string): Promise<void> {
    const seenMessageIds = [...this.state.seenMessageIds, messageId].slice(
      -MAX_SEEN_MESSAGE_IDS,
    );
    this.state = { ...this.state, seenMessageIds };
    await this.saveState();
  }

  private async listMessages(chatId: string) {
    const result = await this.runCommand('lark-cli', [
      'im',
      '+chat-messages-list',
      '--as',
      'user',
      '--chat-id',
      chatId,
      '--order',
      'asc',
      '--page-size',
      '50',
      '--no-reactions',
      '--format',
      'json',
    ]);
    return parseInboxMessages(JSON.parse(result));
  }

  private async loadState(): Promise<InboxState> {
    try {
      const raw = await readFile(this.statePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as InboxState).seenMessageIds)
      ) {
        return { seenMessageIds: [] };
      }
      return parsed as InboxState;
    } catch {
      return { seenMessageIds: [] };
    }
  }

  private saveState(): Promise<void> {
    return writeFile(this.statePath, JSON.stringify(this.state), 'utf8');
  }

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code: number | null) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `${command} 执行失败（${code}）`));
      });
    });
  }
}
