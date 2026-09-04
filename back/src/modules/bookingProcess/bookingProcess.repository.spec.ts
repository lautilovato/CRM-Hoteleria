import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { BookingProcessRepository } from './bookingProcess.repository';
import { BookingProcess, BookingProcessStep } from '../../infrastructure/database/entities/BookingProcess.entity';

describe('BookingProcessRepository', () => {
  let repository: BookingProcessRepository;
  let em: EntityManager;

  const mockTelegramUserId = '123456789';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingProcessRepository,
        {
          provide: EntityManager,
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            persist: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<BookingProcessRepository>(BookingProcessRepository);
    em = module.get<EntityManager>(EntityManager);
  });

  it('findActive busca bookings en IN_PROGRESS o PENDING_CONFIRMATION', async () => {
    await repository.findActive(mockTelegramUserId);

    expect(em.findOne).toHaveBeenCalledWith(BookingProcess, {
      telegramUserId: mockTelegramUserId,
      step: { $in: [BookingProcessStep.IN_PROGRESS, BookingProcessStep.PENDING_CONFIRMATION] },
    });
  });

  it('findLastCompleted busca el booking COMPLETED más reciente', async () => {
    await repository.findLastCompleted(mockTelegramUserId);

    expect(em.findOne).toHaveBeenCalledWith(
      BookingProcess,
      { telegramUserId: mockTelegramUserId, step: BookingProcessStep.COMPLETED },
      { orderBy: { createdAt: 'DESC' } },
    );
  });

  it('create arma un booking nuevo en estado IN_PROGRESS', () => {
    repository.create(mockTelegramUserId);

    expect(em.create).toHaveBeenCalledWith(BookingProcess, {
      telegramUserId: mockTelegramUserId,
      step: BookingProcessStep.IN_PROGRESS,
    });
  });

  it('persist delega en el EntityManager', () => {
    const booking: any = { telegramUserId: mockTelegramUserId };

    repository.persist(booking);

    expect(em.persist).toHaveBeenCalledWith(booking);
  });
});
