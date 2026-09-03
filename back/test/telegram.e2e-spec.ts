import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { TelegramUpdate } from '../src/modules/telegram/telegram.update';
import { RagService } from '../src/modules/rag/rag.service';
import { MikroORM, EntityManager } from '@mikro-orm/core';
import { Room, RoomStatus } from '../src/infrastructure/database/entities/Room.entity';
import { RoomCategory } from '../src/infrastructure/database/entities/RoomCategory.entity';
import { Reservation } from '../src/infrastructure/database/entities/Reservation.entity';
import { BookingProcess } from '../src/infrastructure/database/entities/BookingProcess.entity';
import { getBotToken } from 'nestjs-telegraf';
import { ChatMessage } from '../src/infrastructure/database/entities/ChatMessage.entity';

describe('Telegram Flow (e2e)', () => {
  let app: INestApplication;
  let telegramUpdate: TelegramUpdate;
  let em: EntityManager;
  let ragServiceMock: any;
  let uniqueRoomNumber: string;

  beforeAll(async () => {
    ragServiceMock = { askQuestion: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RagService)
      .useValue(ragServiceMock)
      .overrideProvider(getBotToken())
      .useValue({ launch: jest.fn(), stop: jest.fn(), on: jest.fn(), start: jest.fn(), use: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const orm = app.get(MikroORM);
    em = orm.em.fork();

    telegramUpdate = app.get<TelegramUpdate>(TelegramUpdate);

    const uniqueSuffix = Date.now();
    uniqueRoomNumber = `101-${uniqueSuffix}`;
    
    const category = em.create(RoomCategory, { 
      name: `Suite E2E-${uniqueSuffix}`, 
      capacity: 2, 
      basePrice: 15000 
    });
    
    em.create(Room, { 
      roomNumber: uniqueRoomNumber, 
      category, 
      status: RoomStatus.ACTIVE 
    });
    
    await em.flush();
  });

  afterAll(async () => {
    try {
      await em.nativeDelete(Reservation, {});
      await em.nativeDelete(BookingProcess, {});
      await em.nativeDelete(Room, {});
      await em.nativeDelete(RoomCategory, {});
      
      await em.nativeDelete(ChatMessage, {});

      if (app) await app.close();
    } catch (e) {
    }
  });

  it('Flujo completo: Debería consultar disponibilidad y luego confirmar la reserva en BD', async () => {
    const mockCtx = {
      from: { id: 999888777 },
      sendChatAction: jest.fn(),
      reply: jest.fn(),
    } as any;

    ragServiceMock.askQuestion.mockResolvedValueOnce({
      texto: '',
      accion: 'BUSCAR_DISPONIBILIDAD',
      datos: { checkIn: '2026-11-01', checkOut: '2026-11-05', capacidad: 2 }
    });

    await telegramUpdate.onMessage('Quiero reservar para 2 en noviembre', mockCtx);

    em.clear(); 

    const booking = await em.findOne(BookingProcess, { telegramUserId: '999888777' });
    expect(booking).toBeDefined();
    expect(booking?.step).toBe('PENDING_CONFIRMATION');
    expect(booking?.checkIn).toBe('2026-11-01');

    ragServiceMock.askQuestion.mockResolvedValueOnce({
      texto: '',
      accion: 'CONFIRMAR_RESERVA'
    });

    await telegramUpdate.onMessage('Perfecto, confirmalo', mockCtx);

    em.clear(); 

    const reservation = await em.findOne(Reservation, { telegramUserId: '999888777' }, { populate: ['room'] });
    expect(reservation).toBeDefined();
    expect(Number(reservation?.totalAmount)).toBe(60000); 
    expect(reservation?.room.roomNumber).toBe(uniqueRoomNumber);

    const completedBooking = await em.findOne(BookingProcess, { id: booking?.id });
    expect(completedBooking?.step).toBe('COMPLETED');
  });
});