import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { AuthNPaasService } from '@lark-apaas/nestjs-authnpaas';
import type { Request } from 'express';
import type { NoteStyle } from '@shared/api.interface';
import { NoteInboxService } from './note-inbox.service';

interface ConfigureInboxRequest {
  chatId?: string;
  noteStyle?: NoteStyle;
}

@Controller('api/note-inbox')
export class NoteInboxController {
  constructor(
    private readonly authNPaasService: AuthNPaasService,
    private readonly noteInboxService: NoteInboxService,
  ) {}

  @NeedLogin()
  @Get()
  getStatus(@Req() req: Request) {
    return this.noteInboxService.getStatus(req.userContext.userId);
  }

  @NeedLogin()
  @Post('configure')
  async configure(@Req() req: Request, @Body() body: ConfigureInboxRequest) {
    if (!body.chatId) throw new BadRequestException('请填写飞书会话 ID');
    const noteStyle: NoteStyle = body.noteStyle === 'meeting' ? 'meeting' : 'learning';
    const larkUserId = await this.authNPaasService.getCurrentUserLarkUserId();
    if (!larkUserId) throw new BadRequestException('未找到当前飞书用户身份');
    try {
      return await this.noteInboxService.configure({
        chatId: body.chatId.trim(),
        larkUserId,
        noteStyle,
        ownerId: req.userContext.userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '收件箱配置失败';
      throw new BadRequestException(message);
    }
  }

  @NeedLogin()
  @Post('sync')
  async sync(@Req() req: Request) {
    await this.noteInboxService.sync();
    return this.noteInboxService.getStatus(req.userContext.userId);
  }
}
