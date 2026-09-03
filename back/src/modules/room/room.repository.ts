import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Room } from '../../infrastructure/database/entities/Room.entity';

@Injectable()
export class RoomRepository {
  constructor(private readonly em: EntityManager) {}

  async findByCapacityExcluding(capacity: number, excludedRoomIds: string[]): Promise<Room[]> {
    return this.em.find(Room, {
      category: { capacity: { $gte: capacity } },
      ...(excludedRoomIds.length > 0 ? { id: { $nin: excludedRoomIds } } : {}),
    }, { populate: ['category'] });
  }
}
