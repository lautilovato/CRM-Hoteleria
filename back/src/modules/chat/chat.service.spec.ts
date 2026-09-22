import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService, HANDOVER_REPLY, RELEASE_NOTICE } from './chat.service';
import { ChatRepository } from './chat.repository';
import { ChatGateway } from './chat.gateway';
import { SupportHoursService } from '../supportHours/supportHours.service';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { ChatSession, ChatSessionStatus, HandoverReason } from '../../infrastructure/database/entities/ChatSession.entity';
import { MessageRole } from '../../infrastructure/database/entities/ChatMessage.entity';
import { UserRole } from '../../infrastructure/database/entities/User.entity';
import { AuthUser } from '../auth/auth.types';

const TELEGRAM_USER_ID = '999888777';
const OPERATOR: AuthUser = { id: 'operator-1', email: 'lucrecia@omnidesk.local', role: UserRole.EMPLOYEE };

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: '8f1d2a1e-0000-4000-8000-000000000001',
    telegramUserId: TELEGRAM_USER_ID,
    status: ChatSessionStatus.BOT,
    unreadCount: 0,
    consecutiveBotFailures: 0,
    createdAt: new Date('2026-09-21T10:00:00Z'),
    ...overrides,
  } as ChatSession;
}

describe('ChatService', () => {
  let service: ChatService;
  let repository: any;
  let gateway: any;
  let supportHours: any;
  let bookingProcess: any;
  let bot: any;

  function build(threshold = '3'): ChatService {
    const configService = { get: jest.fn().mockReturnValue(threshold) } as unknown as ConfigService;
    return new ChatService(
      repository as ChatRepository,
      gateway as ChatGateway,
      supportHours as SupportHoursService,
      bookingProcess as BookingProcessService,
      configService,
      bot,
    );
  }

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findByTelegramUserId: jest.fn(),
      getOrCreate: jest.fn(),
      findManyPaginated: jest.fn(),
      findMessagesBefore: jest.fn(),
      createMessage: jest.fn((data) => ({ id: 'message-1', createdAt: new Date('2026-09-21T12:00:00Z'), ...data })),
      readFreshStatus: jest.fn(),
      findOperatorById: jest.fn().mockResolvedValue({ id: OPERATOR.id, fullName: 'Lucrecia Colón' }),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    gateway = {
      emitChatCreated: jest.fn(),
      emitMessage: jest.fn(),
      emitStatus: jest.fn(),
      emitRead: jest.fn(),
    };
    supportHours = { getAvailability: jest.fn().mockResolvedValue({ isOpen: true, nextOpeningLabel: null }) };
    bookingProcess = { getActive: jest.fn().mockResolvedValue(null), markCompleted: jest.fn() };
    bot = { telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) } };

    service = build();
  });

  describe('requestHandover', () => {
    it('CA1: dentro de horario silencia al bot y deja la conversación esperando a un humano', async () => {
      const session = makeSession();

      const result = await service.requestHandover(session, HandoverReason.GUEST_REQUEST);

      expect(result).toEqual({ replyText: HANDOVER_REPLY, muted: true });
      expect(session.status).toBe(ChatSessionStatus.WAITING_HUMAN);
      expect(session.handoverReason).toBe(HandoverReason.GUEST_REQUEST);
      expect(session.handoverRequestedAt).toBeInstanceOf(Date);
      expect(gateway.emitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: ChatSessionStatus.WAITING_HUMAN, previousStatus: ChatSessionStatus.BOT }),
      );
    });

    it('CA5: fuera de horario encola el pedido pero NO silencia al bot', async () => {
      supportHours.getAvailability.mockResolvedValue({ isOpen: false, nextOpeningLabel: 'mañana a las 09:00' });
      const session = makeSession();

      const result = await service.requestHandover(session, HandoverReason.GUEST_REQUEST);

      expect(result.muted).toBe(false);
      expect(result.replyText).toContain('mañana a las 09:00');
      // Silenciarlo dejaría al huésped sin bot y sin humano hasta que abra la recepción.
      expect(session.status).toBe(ChatSessionStatus.BOT);
      expect(session.handoverReason).toBe(HandoverReason.OUT_OF_HOURS);
      expect(session.handoverRequestedAt).toBeInstanceOf(Date);
    });

    it('CA5: sin próxima apertura conocida igual avisa que responderán al abrir', async () => {
      supportHours.getAvailability.mockResolvedValue({ isOpen: false, nextOpeningLabel: null });

      const result = await service.requestHandover(makeSession(), HandoverReason.GUEST_REQUEST);

      expect(result.replyText).toContain('apenas abran');
    });
  });

  describe('registerBotFailure', () => {
    it('recién marca la conversación al alcanzar el umbral, sin silenciar al bot', async () => {
      const session = makeSession();

      await expect(service.registerBotFailure(session)).resolves.toBe(false);
      await expect(service.registerBotFailure(session)).resolves.toBe(false);
      await expect(service.registerBotFailure(session)).resolves.toBe(true);

      expect(session.consecutiveBotFailures).toBe(3);
      expect(session.handoverReason).toBe(HandoverReason.AI_FALLBACK);
      expect(session.status).toBe(ChatSessionStatus.BOT);
      expect(gateway.emitStatus).toHaveBeenCalledTimes(1);
    });

    it('respeta el umbral configurado por entorno', async () => {
      service = build('2');
      const session = makeSession();

      await expect(service.registerBotFailure(session)).resolves.toBe(false);
      await expect(service.registerBotFailure(session)).resolves.toBe(true);
    });

    it('no pisa un pedido explícito del huésped con el motivo de fallback', async () => {
      const session = makeSession({
        handoverRequestedAt: new Date(),
        handoverReason: HandoverReason.GUEST_REQUEST,
        consecutiveBotFailures: 2,
      });

      await service.registerBotFailure(session);

      expect(session.handoverReason).toBe(HandoverReason.GUEST_REQUEST);
    });
  });

  describe('resetBotFailures', () => {
    it('baja la bandera que había levantado el propio fallback', async () => {
      const session = makeSession({
        consecutiveBotFailures: 3,
        handoverRequestedAt: new Date(),
        handoverReason: HandoverReason.AI_FALLBACK,
      });

      await service.resetBotFailures(session);

      expect(session.consecutiveBotFailures).toBe(0);
      expect(session.handoverRequestedAt).toBeUndefined();
      expect(session.handoverReason).toBeUndefined();
    });

    it('nunca borra un pedido explícito del huésped', async () => {
      const requestedAt = new Date();
      const session = makeSession({
        consecutiveBotFailures: 1,
        handoverRequestedAt: requestedAt,
        handoverReason: HandoverReason.GUEST_REQUEST,
      });

      await service.resetBotFailures(session);

      expect(session.consecutiveBotFailures).toBe(0);
      expect(session.handoverRequestedAt).toBe(requestedAt);
    });
  });

  describe('sendOperatorMessage', () => {
    it('CA3: escribir con el chat en modo bot toma el control de forma implícita', async () => {
      const session = makeSession();
      repository.findById.mockResolvedValue(session);

      const result = await service.sendOperatorMessage('chat-1', OPERATOR, { text: 'Hola, soy de recepción' });

      expect(session.status).toBe(ChatSessionStatus.HUMAN);
      expect(session.assignedOperator).toMatchObject({ id: OPERATOR.id });
      expect(result.role).toBe(MessageRole.OPERATOR);
      expect(result.sentBy).toMatchObject({ id: OPERATOR.id, fullName: 'Lucrecia Colón' });
      expect(gateway.emitStatus).toHaveBeenCalledTimes(1);
      expect(gateway.emitMessage).toHaveBeenCalledTimes(1);
    });

    it('manda el texto crudo y sin parse_mode, para que un "<" no rompa el envío', async () => {
      repository.findById.mockResolvedValue(makeSession());

      await service.sendOperatorMessage('chat-1', OPERATOR, { text: 'el precio es <500 USD' });

      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(TELEGRAM_USER_ID, 'el precio es <500 USD');
      expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(repository.createMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'el precio es <500 USD' }));
    });

    it('si Telegram rechaza el mensaje no lo persiste ni cambia el estado', async () => {
      const session = makeSession();
      repository.findById.mockResolvedValue(session);
      bot.telegram.sendMessage.mockRejectedValue(new Error('403: bot was blocked by the user'));

      await expect(service.sendOperatorMessage('chat-1', OPERATOR, { text: 'Hola' })).rejects.toBeInstanceOf(BadGatewayException);

      expect(repository.createMessage).not.toHaveBeenCalled();
      expect(repository.flush).not.toHaveBeenCalled();
      expect(session.status).toBe(ChatSessionStatus.BOT);
    });

    it('no vuelve a emitir el cambio de estado si el chat ya estaba tomado', async () => {
      repository.findById.mockResolvedValue(makeSession({ status: ChatSessionStatus.HUMAN }));

      await service.sendOperatorMessage('chat-1', OPERATOR, { text: 'Seguimos' });

      expect(gateway.emitStatus).not.toHaveBeenCalled();
      expect(gateway.emitMessage).toHaveBeenCalledTimes(1);
    });

    it('404 si la conversación no existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.sendOperatorMessage('nope', OPERATOR, { text: 'Hola' })).rejects.toBeInstanceOf(NotFoundException);
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('releaseToBot', () => {
    it('CA4: devuelve el control, limpia el estado y avisa al huésped', async () => {
      const session = makeSession({
        status: ChatSessionStatus.HUMAN,
        consecutiveBotFailures: 2,
        handoverRequestedAt: new Date(),
        handoverReason: HandoverReason.GUEST_REQUEST,
      });
      repository.findById.mockResolvedValue(session);

      const result = await service.releaseToBot('chat-1', OPERATOR);

      expect(session.status).toBe(ChatSessionStatus.BOT);
      expect(session.assignedOperator).toBeNull();
      expect(session.consecutiveBotFailures).toBe(0);
      expect(session.handoverRequestedAt).toBeUndefined();
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(TELEGRAM_USER_ID, RELEASE_NOTICE);
      expect(result.guestNotified).toBe(true);
    });

    it('si Telegram falla, el estado igual queda consistente y se informa guestNotified: false', async () => {
      const session = makeSession({ status: ChatSessionStatus.HUMAN });
      repository.findById.mockResolvedValue(session);
      bot.telegram.sendMessage.mockRejectedValue(new Error('timeout'));

      const result = await service.releaseToBot('chat-1', OPERATOR);

      expect(result.guestNotified).toBe(false);
      expect(session.status).toBe(ChatSessionStatus.BOT);
      expect(repository.flush).toHaveBeenCalled();
    });

    it('cierra el proceso de reserva a medias cuando se lo piden', async () => {
      const activeBooking = { id: 'booking-1' };
      repository.findById.mockResolvedValue(makeSession({ status: ChatSessionStatus.HUMAN }));
      bookingProcess.getActive.mockResolvedValue(activeBooking);

      const result = await service.releaseToBot('chat-1', OPERATOR, { closeActiveBooking: true });

      expect(bookingProcess.markCompleted).toHaveBeenCalledWith(activeBooking);
      expect(result.activeBooking).toBeNull();
    });

    it('por defecto deja el proceso de reserva intacto', async () => {
      repository.findById.mockResolvedValue(makeSession({ status: ChatSessionStatus.HUMAN }));
      bookingProcess.getActive.mockResolvedValue({ id: 'booking-1', step: 'PENDING_CONFIRMATION' });

      const result = await service.releaseToBot('chat-1', OPERATOR);

      expect(bookingProcess.markCompleted).not.toHaveBeenCalled();
      expect(result.activeBooking).toMatchObject({ id: 'booking-1' });
    });
  });

  describe('takeOver', () => {
    it('CA2: asigna el operador, silencia al bot y apaga la bandera de intervención', async () => {
      const session = makeSession({ handoverRequestedAt: new Date(), handoverReason: HandoverReason.GUEST_REQUEST });
      repository.findById.mockResolvedValue(session);

      await service.takeOver('chat-1', OPERATOR);

      expect(session.status).toBe(ChatSessionStatus.HUMAN);
      expect(session.handoverRequestedAt).toBeUndefined();
      expect(gateway.emitStatus).toHaveBeenCalledTimes(1);
      // La nota del takeover es interna: no se le manda nada al huésped.
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('la nota interna del takeover no pisa el preview de la bandeja', async () => {
      const session = makeSession({ lastMessagePreview: '¿Tienen pileta?' });
      repository.findById.mockResolvedValue(session);

      await service.takeOver('chat-1', OPERATOR);

      expect(session.lastMessagePreview).toBe('¿Tienen pileta?');
    });
  });

  describe('recordIncomingMessage', () => {
    it('suma un no leído, actualiza el preview y publica el mensaje', async () => {
      const session = makeSession();

      await service.recordIncomingMessage(session, 'Hola, ¿tienen lugar?');

      expect(session.unreadCount).toBe(1);
      expect(session.lastMessagePreview).toBe('Hola, ¿tienen lugar?');
      expect(session.lastMessageRole).toBe(MessageRole.USER);
      expect(repository.flush).toHaveBeenCalledTimes(1);
      expect(gateway.emitMessage).toHaveBeenCalledTimes(1);
    });

    it('trunca el preview a 200 caracteres', async () => {
      const session = makeSession();

      await service.recordIncomingMessage(session, 'a'.repeat(500));

      expect(session.lastMessagePreview).toHaveLength(200);
    });
  });

  describe('getMessages', () => {
    it('devuelve nextCursor solo cuando quedan mensajes más viejos', async () => {
      repository.findById.mockResolvedValue(makeSession());
      const rows = Array.from({ length: 3 }, (_, index) => ({
        id: `m${index}`,
        role: MessageRole.USER,
        content: `mensaje ${index}`,
        createdAt: new Date(`2026-09-21T1${index}:00:00Z`),
      }));
      repository.findMessagesBefore.mockResolvedValue(rows);

      const page = await service.getMessages('chat-1', { limit: 2 });

      expect(page.data).toHaveLength(2);
      expect(page.nextCursor).toBe(rows[1].createdAt.toISOString());
    });

    it('cierra la paginación cuando ya no quedan mensajes', async () => {
      repository.findById.mockResolvedValue(makeSession());
      repository.findMessagesBefore.mockResolvedValue([
        { id: 'm0', role: MessageRole.USER, content: 'único', createdAt: new Date() },
      ]);

      const page = await service.getMessages('chat-1', { limit: 50 });

      expect(page.data).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe('markAsRead', () => {
    it('deja los no leídos en cero y avisa al resto del panel', async () => {
      const session = makeSession({ unreadCount: 4 });
      repository.findById.mockResolvedValue(session);

      await expect(service.markAsRead('chat-1', OPERATOR)).resolves.toEqual({ unreadCount: 0 });

      expect(session.unreadCount).toBe(0);
      expect(gateway.emitRead).toHaveBeenCalledWith(session.id, { id: OPERATOR.id, fullName: 'Lucrecia Colón' });
    });

    it('no escribe en la base si ya estaba leída', async () => {
      repository.findById.mockResolvedValue(makeSession({ unreadCount: 0 }));

      await service.markAsRead('chat-1', OPERATOR);

      expect(repository.flush).not.toHaveBeenCalled();
    });
  });

  describe('getOrCreateSession', () => {
    it('avisa al panel solo cuando la conversación es nueva', async () => {
      repository.getOrCreate.mockResolvedValue({ session: makeSession(), created: true });
      await service.getOrCreateSession(TELEGRAM_USER_ID);
      expect(gateway.emitChatCreated).toHaveBeenCalledTimes(1);

      repository.getOrCreate.mockResolvedValue({ session: makeSession(), created: false });
      await service.getOrCreateSession(TELEGRAM_USER_ID);
      expect(gateway.emitChatCreated).toHaveBeenCalledTimes(1);
    });
  });

  describe('isMuted', () => {
    it.each([
      [ChatSessionStatus.BOT, false],
      [ChatSessionStatus.WAITING_HUMAN, true],
      [ChatSessionStatus.HUMAN, true],
    ])('con estado %s devuelve %s', (status, expected) => {
      expect(service.isMuted(makeSession({ status }))).toBe(expected);
    });
  });

  describe('wasTakenOverMeanwhile', () => {
    it('detecta que un operador tomó el control mientras la IA pensaba', async () => {
      repository.readFreshStatus.mockResolvedValue(ChatSessionStatus.HUMAN);
      await expect(service.wasTakenOverMeanwhile(makeSession())).resolves.toBe(true);
    });

    it('deja responder si el chat sigue en manos del bot', async () => {
      repository.readFreshStatus.mockResolvedValue(ChatSessionStatus.BOT);
      await expect(service.wasTakenOverMeanwhile(makeSession())).resolves.toBe(false);
    });
  });
});
