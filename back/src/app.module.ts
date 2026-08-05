import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import databaseConfig from './infrastructure/database/database.config';

@Module({
  imports: [
    MikroOrmModule.forRoot(databaseConfig),
  ],
})
export class AppModule {}