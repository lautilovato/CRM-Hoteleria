import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import databaseConfig from './infrastructure/database/database.config';
import { RagModule } from './modules/rag/rag.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MikroOrmModule.forRoot(databaseConfig),
    RagModule,
    TelegramModule,
    PaymentModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
        middlewares: [session()],
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}