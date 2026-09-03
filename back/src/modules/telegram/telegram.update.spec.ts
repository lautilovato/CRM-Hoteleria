import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { Context } from 'telegraf';
import { TelegramUpdate } from './telegram.update';
import { RagService } from '../rag/rag.service';

describe('TelegramUpdate', () => {
  let update: TelegramUpdate;
  let ragService: RagService;
  let em: EntityManager;

  const mockTelegramUserId = '123456789';
  let mockCtx: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramUpdate,
        {
          provide: RagService,
          useValue: { askQuestion: jest.fn() },
        },
        {
          provide: EntityManager,
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn().mockImplementation((entity, data) => data),
            persist: jest.fn(),
            flush: jest.fn(),
          },
        },
      ],
    }).compile();

    update = module.get<TelegramUpdate>(TelegramUpdate);
    ragService = module.get<RagService>(RagService);
    em = module.get<EntityManager>(EntityManager);

    mockCtx = {
      from: { id: mockTelegramUserId },
      sendChatAction: jest.fn(),
      reply: jest.fn(),
    };
  });

  it('debería responder un mensaje simple (RESPONDER)', async () => {
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: 'Hola, soy Chamber',
      accion: 'RESPONDER',
    } as any);
    
    jest.spyOn(em, 'find').mockResolvedValue([]);
    jest.spyOn(em, 'findOne').mockResolvedValue(null);

    await update.onMessage('Hola', mockCtx);

    expect(mockCtx.reply).toHaveBeenCalledWith('Hola, soy Chamber');
    expect(em.persist).toHaveBeenCalledTimes(2);
  });

  it('debería buscar disponibilidad y encontrar habitación (BUSCAR_DISPONIBILIDAD)', async () => {
    const mockRoom = { id: 'room-1', category: { name: 'Suite', basePrice: 100 } };
    
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      accion: 'BUSCAR_DISPONIBILIDAD',
      datos: { checkIn: '2026-10-10', checkOut: '2026-10-15', capacidad: 2 }
    } as any);

    jest.spyOn(em, 'findOne').mockResolvedValue(null);
    jest.spyOn(em, 'find').mockImplementation(async (entity: any) => {
      if (entity.name === 'Reservation') return [];
      if (entity.name === 'Room') return [mockRoom];
      return [];
    });

    await update.onMessage('Quiero reservar', mockCtx);

    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('¡Buenas noticias! Tenemos disponibilidad en nuestra Suite')
    );
  });

  it('debería confirmar una reserva si hay un proceso pendiente (CONFIRMAR_RESERVA)', async () => {
    const activeBooking = {
      telegramUserId: mockTelegramUserId,
      step: 'PENDING_CONFIRMATION',
      checkIn: '2026-10-10',
      checkOut: '2026-10-15',
      roomType: '2'
    };
    const mockRoom = { id: 'room-1', category: { name: 'Suite', basePrice: 100 } };

    jest.spyOn(em, 'findOne').mockResolvedValue(activeBooking);
    jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
      texto: '',
      accion: 'CONFIRMAR_RESERVA'
    } as any);

    jest.spyOn(em, 'find').mockImplementation(async (entity: any) => {
      if (entity.name === 'Reservation') return []; 
      if (entity.name === 'Room') return [mockRoom]; 
      return [];
    });

    await update.onMessage('Sí, confirmo', mockCtx);

    expect(activeBooking.step).toBe('COMPLETED');
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('ha sido confirmada con éxito')
    );
    expect(em.persist).toHaveBeenCalledTimes(3); 
  });
});