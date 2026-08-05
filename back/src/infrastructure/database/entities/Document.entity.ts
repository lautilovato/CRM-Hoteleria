import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { CustomBaseEntity } from './CustomBase.entity';

@Entity()
export class Document extends CustomBaseEntity {

  @PrimaryKey({type: 'integer', autoincrement: true})
  id!: number;

  @Property({ type: 'text' })
  content!: string;

  @Property({ type: 'vector', columnType: 'vector(1536)' })
  embedding!: number[];
}