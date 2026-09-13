import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  AnalyzeProviderUrlRequest,
  ProviderUrlAnalysis,
  SetupModelValidationRequest,
  SetupStatusResponse,
  UpdateSetupProgressRequest,
} from '@shared/api.interface';
import { SetupService } from './setup.service';
import { analyzeProviderUrl } from './provider-url.utils';

@Controller('api/setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @NeedLogin()
  @Get('status')
  status(): Promise<SetupStatusResponse> {
    return this.setupService.getStatus();
  }

  @NeedLogin()
  @Put('progress')
  updateProgress(
    @Body() body: UpdateSetupProgressRequest,
  ): Promise<SetupStatusResponse> {
    return this.setupService.updateProgress(body);
  }

  @NeedLogin()
  @Post('environment/validate')
  validateEnvironment() {
    return this.setupService.validateEnvironment();
  }

  @NeedLogin()
  @Post('providers/analyze-url')
  analyzeUrl(@Body() body: AnalyzeProviderUrlRequest): ProviderUrlAnalysis {
    return analyzeProviderUrl(body.baseUrl);
  }

  @NeedLogin()
  @Post('models/validate-summary')
  validateSummary(@Body() body: SetupModelValidationRequest) {
    return this.setupService.validateSummaryModel(body);
  }

  @NeedLogin()
  @Post('models/validate-transcription')
  validateTranscription(@Body() body: SetupModelValidationRequest) {
    return this.setupService.validateTranscriptionModel(body);
  }

  @NeedLogin()
  @Post('transcription/validate-tencent')
  validateTencentAsr() {
    return this.setupService.validateTencentAsr();
  }

  @NeedLogin()
  @Post('complete')
  complete(): Promise<SetupStatusResponse> {
    return this.setupService.complete();
  }

  @NeedLogin()
  @Post('reset-progress')
  resetProgress(): Promise<SetupStatusResponse> {
    return this.setupService.resetProgress();
  }
}
