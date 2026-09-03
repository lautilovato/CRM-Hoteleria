import { Entity, PrimaryKey, Property, Enum } from '@mikro-orm/decorators/legacy';
import { v4 } from 'uuid';
import { CustomBaseEntity } from './CustomBase.entity';

export enum MessageRole {
  USER = 'USER',
  BOT = 'BOT',
  SYSTEM = 'SYSTEM',
}

@Entity({ tableName: 'chat_messages' })
export class ChatMessage extends CustomBaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @Property({ type: 'varchar' })
  telegramUserId!: string;

  @Enum(() => MessageRole)
  role: MessageRole = MessageRole.USER;

  @Property({ type: 'text' })
  content!: string;
}