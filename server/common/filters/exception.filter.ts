import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { BusinessException } from '../interfaces/exception.interface';
import { HTTP_STATUS_TO_RESPONSE_CODE_MAP, ResponseCode } from '../constants/api_response_code';
import { ApiErrorResponse } from '../interfaces/api_response.interface';
import { LocalFilePersistenceError } from '../utils/local-file-write';

// 全局异常过滤器，用于捕获所有未处理的异常
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
     
    // 如果响应头已发送，则不处理
    if (response.headersSent) {
      return;
    }

    let errorResponse: Omit<ApiErrorResponse, 'httpStatus'>;
    let httpStatus: HttpStatus;

    if (exception instanceof BusinessException) {
      // 业务异常
      httpStatus = exception.httpStatus;
      errorResponse = {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          fieldErrors: exception.fieldErrors,
          timestamp: Date.now(),
        },
      };
    } else if (exception instanceof HttpException) {
      // HTTP异常
      httpStatus = exception.getStatus() as HttpStatus;
      const exceptionResponse = exception.getResponse();

      errorResponse = {
        error: {
          code: HTTP_STATUS_TO_RESPONSE_CODE_MAP[httpStatus],
          message: typeof exceptionResponse === 'string' ? exceptionResponse : exception.message,
          details: typeof exceptionResponse === 'object' ? JSON.stringify(exceptionResponse) : undefined,
          timestamp: Date.now(),
        },
      };
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      (exception as { code?: unknown }).code === '22P02'
    ) {
      // Postgres invalid_text_representation：路径/查询参数与列类型不匹配（最常见是非法 UUID）
      // 与「合法 UUID 但记录不存在」走同一条 not-found 语义，避免 500 噪声
      httpStatus = HttpStatus.NOT_FOUND;
      errorResponse = {
        error: {
          code: ResponseCode.NOT_FOUND,
          message: '资源不存在',
          timestamp: Date.now(),
        },
      };
    } else if (exception instanceof LocalFilePersistenceError) {
      httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
      errorResponse = {
        error: {
          code: ResponseCode.SERVICE_UNAVAILABLE,
          details:
            '首次配置尚未保存。处理完成后，直接点击原来的按钮再次尝试即可。',
          message: exception.message,
          timestamp: Date.now(),
        },
      };
    } else {
      // 未知异常
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
      const stack: string | undefined =
        exception instanceof Error ? exception.stack : undefined;
      const detail: string =
        exception instanceof Error && exception.message
          ? exception.message
          : String(exception);
      this.logger.error(`未处理的服务异常：${detail}`, stack);
      errorResponse = {
        error: {
          code: ResponseCode.INTERNAL_ERROR,
          details:
            '请重试当前操作；若仍然出现，请打开本机日志并提供发生时间。',
          message:
            '后台服务遇到未预期错误。请重试；若问题持续，请打开本机日志查看详情。',
          timestamp: Date.now(),
        },
      };
    }

    response.status(httpStatus).json(errorResponse);
  }
}
