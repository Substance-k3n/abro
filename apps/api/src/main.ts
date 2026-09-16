import 'reflect-metadata';

import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3200',
    credentials: true,
  });

  const port = process.env.PORT ?? 3201;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ABRO API listening on port ${port}`);
}

void bootstrap();
