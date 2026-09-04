import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { TelegramUpdate } from '../src/modules/telegram/telegram.update';
import { RagService, ChatAction } from '../src/modules/rag/rag.service';
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
      action: ChatAction.SEARCH_AVAILABILITY,
      datos: { checkIn: '01-11-2026', checkOut: '05-11-2026', capacity: 2 }
    });

    await telegramUpdate.onMessage('Quiero reservar para 2 en noviembre', mockCtx);

    em.clear(); 

    const booking = await em.findOne(BookingProcess, { telegramUserId: '999888777' });
    expect(booking).toBeDefined();
    expect(booking?.step).toBe('PENDING_CONFIRMATION');
    expect(booking?.checkIn).toBe('01-11-2026');

    ragServiceMock.askQuestion.mockResolvedValueOnce({
      texto: '',
      action: ChatAction.CONFIRM_RESERVATION
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

  it('Flujo sin disponibilidad: debería reintentar con otra capacidad reutilizando el mismo booking', async () => {
    const otherTelegramUserId = '111222333';
    const mockCtx = {
      from: { id: 111222333 },
      sendChatAction: jest.fn(),
      reply: jest.fn(),
    } as any;

    ragServiceMock.askQuestion.mockResolvedValueOnce({
      texto: '',
      action: ChatAction.SEARCH_AVAILABILITY,
      datos: { checkIn: '01-12-2026', checkOut: '05-12-2026', capacity: 99 }
    });

    await telegramUpdate.onMessage('Quiero reservar para 99 personas', mockCtx);

    em.clear();

    let booking = await em.findOne(BookingProcess, { telegramUserId: otherTelegramUserId });
    expect(booking).toBeDefined();
    expect(booking?.step).toBe('IN_PROGRESS');
    expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('no nos quedan habitaciones'));

    const firstBookingId = booking?.id;

    ragServiceMock.askQuestion.mockResolvedValueOnce({
      texto: '',
      action: ChatAction.SEARCH_AVAILABILITY,
      datos: { checkIn: '01-12-2026', checkOut: '05-12-2026', capacity: 2 }
    });

    await telegramUpdate.onMessage('Probemos con 2 personas', mockCtx);

    em.clear();

    booking = await em.findOne(BookingProcess, { telegramUserId: otherTelegramUserId });
    expect(booking?.id).toBe(firstBookingId);
    expect(booking?.step).toBe('PENDING_CONFIRMATION');
    expect(booking?.capacity).toBe(2);
  });
});