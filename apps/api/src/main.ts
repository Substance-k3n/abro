import 'reflect-metadata';
import './common/bigint-json';

import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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

  // Dev-only API explorer at /docs. Routes/methods are always accurate
  // (introspected straight from the controllers); request/response body
  // schemas are thin -- every endpoint validates with @abro/types' zod
  // schemas on plain objects, not class-based DTOs, so there are no
  // @ApiProperty()-style decorators for Swagger to read yet.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ABRO API')
      .setDescription(
        'docs/ABRO_PRD.md — session-cookie auth, not bearer tokens; sign in via /auth/otp/* or /auth/google first, then Swagger UI carries the cookie on Try It Out.',
      )
      .setVersion('0.1.0')
      .addCookieAuth('abro_session')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 3201;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ABRO API listening on port ${port}`);
}

void bootstrap();
