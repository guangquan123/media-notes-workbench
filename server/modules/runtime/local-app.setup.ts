import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { LocalUserContextMiddleware } from './local-user-context.middleware';

export function configureLocalApp(app: NestExpressApplication): void {
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }));
  const middleware = new LocalUserContextMiddleware();
  app.use(middleware.use.bind(middleware));
}
