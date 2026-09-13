import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createValidationPipe } from './validation.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // El formulario de prepago corre en otro origen y consume /payment/:id/summary desde el navegador.
  app.enableCors({ origin: process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173' });
  app.useGlobalPipes(createValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
