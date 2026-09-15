import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3200',
  });

  const port = process.env.PORT ?? 3201;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ABRO API listening on port ${port}`);
}

void bootstrap();
