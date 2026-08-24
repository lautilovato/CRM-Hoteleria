import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
    transform: true,
    exceptionFactory: (errors) => {
      const constraints = errors[0].constraints || {};
      
      const firstError = Object.values(constraints)[0] || 'Error de validación';
      
      return new BadRequestException({
        message: firstError,
        error: 'Bad Request',
        statusCode: 400
      });
    }
  }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
