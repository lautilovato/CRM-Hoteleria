import { Migration } from '@mikro-orm/migrations';

export class Migration20260816171346 extends Migration {

  override up(): void | Promise<void> {
    this.addSql('CREATE EXTENSION IF NOT EXISTS vector;');
    this.addSql(`create table "document" ("id" serial primary key, "created_at" timestamp(6) not null default now(), "updated_at" timestamp(6) null, "content" text not null, "embedding" vector(768) not null);`);
  }

}