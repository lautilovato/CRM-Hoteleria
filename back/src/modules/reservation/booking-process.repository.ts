import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { BookingProcess } from '../../infrastructure/database/entities/BookingProcess.entity';

@Injectable()
export class BookingProcessRepository {
  constructor(private readonly em: EntityManager) {}

  async findActive(telegramUserId: string): Promise<BookingProcess | null> {
    return this.em.findOne(BookingProcess, {
      telegramUserId,
      step: { $in: ['IN_PROGRESS', 'PENDING_CONFIRMATION'] },
    });
  }

  async findLastCompleted(telegramUserId: string): Promise<BookingProcess | null> {
    return this.em.findOne(
      BookingProcess, { telegramUserId, step: 'COMPLETED' }, { orderBy: { createdAt: 'DESC' } }
    );
  }

  create(telegramUserId: string): BookingProcess {
    return this.em.create(BookingProcess, { telegramUserId, step: 'IN_PROGRESS' });
  }

  persist(booking: BookingProcess): void {
    this.em.persist(booking);
  }
}
