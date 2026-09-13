import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request, Response } from 'express';
import type {
  RuntimeControlOperation,
  RuntimeControlSession,
  RuntimeControlStatus,
  StopRuntimeRequest,
} from '@shared/api.interface';
import { RuntimeControlService } from './runtime-control.service';
import { RuntimeControlAuthService } from './runtime-control-auth.service';

@Controller('api/runtime/control')
export class RuntimeControlController {
  constructor(
    private readonly runtimeControlService: RuntimeControlService,
    private readonly runtimeControlAuthService: RuntimeControlAuthService,
  ) {}

  @NeedLogin()
  @Get('session')
  session(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): RuntimeControlSession {
    return this.runtimeControlAuthService.createSession(request, response);
  }

  @NeedLogin()
  @Get('status')
  status(@Req() request: Request): RuntimeControlStatus {
    this.runtimeControlAuthService.assertAuthorized(request);
    return this.runtimeControlService.getStatus();
  }

  @NeedLogin()
  @Post('stop')
  stop(
    @Req() request: Request,
    @Body() body: StopRuntimeRequest,
  ): RuntimeControlOperation {
    this.runtimeControlAuthService.assertAuthorized(request);
    if (body.mode !== 'immediate' && body.mode !== 'after_tasks') {
      throw new BadRequestException('停止模式无效');
    }
    return this.runtimeControlService.requestStop(body);
  }

  @NeedLogin()
  @Post('restart')
  restart(@Req() request: Request): RuntimeControlOperation {
    this.runtimeControlAuthService.assertAuthorized(request);
    return this.runtimeControlService.requestRestart();
  }

  @NeedLogin()
  @Delete('scheduled-stop')
  cancelScheduledStop(@Req() request: Request): RuntimeControlStatus {
    this.runtimeControlAuthService.assertAuthorized(request);
    return this.runtimeControlService.cancelScheduledStop();
  }
}
