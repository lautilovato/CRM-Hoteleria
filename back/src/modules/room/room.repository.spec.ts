import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { RoomRepository } from './room.repository';
import { Room } from '../../infrastructure/database/entities/Room.entity';

describe('RoomRepository', () => {
  let repository: RoomRepository;
  let em: EntityManager;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomRepository,
        {
          provide: EntityManager,
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    repository = module.get<RoomRepository>(RoomRepository);
    em = module.get<EntityManager>(EntityManager);
  });

  it('busca habitaciones por capacidad excluyendo las indicadas', async () => {
    await repository.findByCapacityExcluding(2, ['room-1', 'room-2']);

    expect(em.find).toHaveBeenCalledWith(
      Room,
      { category: { capacity: { $gte: 2 } }, id: { $nin: ['room-1', 'room-2'] } },
      { populate: ['category'] },
    );
  });

  it('no agrega el filtro $nin cuando no hay habitaciones a excluir', async () => {
    await repository.findByCapacityExcluding(2, []);

    expect(em.find).toHaveBeenCalledWith(
      Room,
      { category: { capacity: { $gte: 2 } } },
      { populate: ['category'] },
    );
  });
});
