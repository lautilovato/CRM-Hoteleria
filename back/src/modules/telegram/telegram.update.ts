import { Update, Ctx, Start, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { EntityManager, MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RagService, ChatAction } from '../rag/rag.service';
import { ReservationService, AlternativeDates, ALTERNATIVE_DATES_WINDOW_DAYS } from '../reservation/reservation.service';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { ChatService } from '../chat/chat.service';
import { detectHumanRequest, isUnresolvedReply } from '../chat/handover.detector';
import { SearchAvailabilityDto } from '../bookingProcess/dto/searchAvailability.dto';
import { ConfirmReservationDto } from '../reservation/dto/confirmReservation.dto';
import { ChatMessage } from '../../infrastructure/database/entities/ChatMessage.entity';
import { ChatSession, HandoverReason } from '../../infrastructure/database/entities/ChatSession.entity';
import { BookingProcess, BookingProcessStep } from '../../infrastructure/database/entities/BookingProcess.entity';
import { TelegramProfile } from '../chat/chat.repository';
import { escapeHtml } from './telegram.format';

/** Cuántos mensajes previos se le pasan a Gemini como contexto conversacional. */
const HISTORY_SIZE = 6;

const GENERIC_FALLBACK = 'Disculpá, no pude procesar tu mensaje. ¿Podés reformularlo?';

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  /** Lo que respondemos cuando el huésped acepta la oferta pero todavía no tenemos sus datos. */
  private static readonly ASK_GUEST_DATA =
    'Genial, te la reservo. Para tomarla necesito el nombre completo y el DNI del huésped que se aloja.';

  constructor(
    private readonly ragService: RagService,
    private readonly reservationService: ReservationService,
    private readonly bookingProcessService: BookingProcessService,
    private readonly chatService: ChatService,
    private readonly orm: MikroORM,
    private readonly em: EntityManager,
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    const greeting = '¡Hola! Soy Chamber , el asistente virtual del hotel. ¿En qué puedo ayudarte?';

    if (ctx.from) {
      // Se registra la sesión ya en el /start para que la conversación aparezca en el panel
      // aunque el huésped todavía no haya escrito nada.
      await this.withRequestContext(async () => {
        const session = await this.chatService.getOrCreateSession(ctx.from!.id.toString(), this.readProfile(ctx));
        await this.chatService.recordBotMessage(session, greeting);
      });
    }

    await ctx.reply(greeting);
  }

  @On('text')
  async onMessage(@Message('text') text: string, @Ctx() ctx: Context) {
    if (!ctx.from) return;

    await this.withRequestContext(() => this.handleGuestMessage(text, ctx, ctx.from!.id.toString()));
  }

  private async handleGuestMessage(text: string, ctx: Context, telegramUserId: string): Promise<void> {
    let session: ChatSession | undefined;

    try {
      session = await this.chatService.getOrCreateSession(telegramUserId, this.readProfile(ctx));

      // El mensaje del huésped se persiste y se publica antes de tocar la IA: en modo humano no
      // hay respuesta que esperar, y aunque Gemini falle el mensaje no se puede perder.
      const incoming = await this.chatService.recordIncomingMessage(session, text);

      // CA2: con un operador al mando, el bot ni siquiera muestra el "escribiendo...".
      if (this.chatService.isMuted(session)) {
        this.logger.log(`Chat ${session.id} en modo humano: el mensaje de ${telegramUserId} no se procesa`);
        return;
      }

      await ctx.sendChatAction('typing');

      // CA1, primera capa: si el pedido es explícito no hace falta gastar una llamada al modelo,
      // y así la derivación sigue funcionando aunque Gemini esté caído.
      if (detectHumanRequest(text)) {
        await this.handleHandover(ctx, session, HandoverReason.GUEST_REQUEST);
        return;
      }

      const activeBooking = await this.bookingProcessService.getActive(telegramUserId);
      const lastCompletedBooking = await this.bookingProcessService.getLastCompleted(telegramUserId);

      // Se excluye el mensaje recién guardado: ya viaja aparte como pregunta del usuario.
      const previousMessages = await this.em.find(
        ChatMessage,
        { telegramUserId, id: { $ne: incoming.id } },
        { orderBy: { createdAt: 'DESC' }, limit: HISTORY_SIZE },
      );

      const history = previousMessages.reverse();
      const aiResponse = await this.ragService.askQuestion(text, activeBooking, history, lastCompletedBooking);

      // CA1, segunda capa: el modelo entendió un pedido indirecto ("no me estás ayudando").
      if (aiResponse.action === ChatAction.REQUEST_HUMAN) {
        await this.handleHandover(ctx, session, HandoverReason.GUEST_REQUEST);
        return;
      }

      const botReply = (await this.resolveBotReply(aiResponse, telegramUserId, activeBooking, text, history))
        || GENERIC_FALLBACK;

      // askQuestion tarda segundos y en ese rato un operador puede haber tomado el control.
      // Sin este chequeo el bot le contesta por encima al humano.
      if (await this.chatService.wasTakenOverMeanwhile(session)) {
        this.logger.log(`Se descarta la respuesta del bot para ${telegramUserId}: un operador tomó el control`);
        return;
      }

      await this.chatService.recordBotMessage(session, botReply);

      // El texto viaja como HTML para que el link de pago sea clickeable; todo lo que no armamos
      // nosotros (texto de la IA) ya viene escapado desde resolveBotReply.
      await ctx.reply(botReply, { parse_mode: 'HTML' });

      // Fallback prolongado: no silencia al bot, solo levanta la bandera para que el panel avise.
      if (isUnresolvedReply(botReply)) await this.chatService.registerBotFailure(session);
      else await this.chatService.resetBotFailures(session);

    } catch (error: any) {
        this.logger.error(`Error procesando el mensaje: ${error}`);

        if (session) await this.registerFailureSafely(session);

        if (error?.status === 503) {
          await ctx.reply('El sistema está experimentando alta demanda en este segundo. Dame un minutito y volvé a escribirme.');
        } else {
          await ctx.reply('Hubo un error técnico al procesar tu consulta. Por favor, intentá nuevamente.');
        }
    }
  }

  /**
   * CA1/CA5. El texto ya lo decide ChatService según el horario de atención: dentro de horario
   * silencia al bot, fuera de horario encola el pedido y Chamber sigue respondiendo.
   */
  private async handleHandover(ctx: Context, session: ChatSession, reason: HandoverReason): Promise<void> {
    const { replyText, muted } = await this.chatService.requestHandover(session, reason);
    this.logger.log(`Handover de ${session.telegramUserId} (${reason}); bot silenciado: ${muted}`);

    // Sin parse_mode: son mensajes nuestros, de texto plano, sin nada que interpretar como HTML.
    await ctx.reply(replyText);
  }

  /**
   * El contador de fallos es información secundaria: si el flush falla porque el EntityManager
   * quedó sucio por el error original, no puede tapar la respuesta al huésped.
   */
  private async registerFailureSafely(session: ChatSession): Promise<void> {
    try {
      await this.chatService.registerBotFailure(session);
    } catch (error) {
      this.logger.warn(`No se pudo registrar el fallo del bot para ${session.telegramUserId}: ${error}`);
    }
  }

  /**
   * El middleware de request de @mikro-orm/nestjs solo corre en HTTP; los updates de Telegraf
   * quedaban fuera y compartían el EntityManager global entre conversaciones.
   */
  private withRequestContext<T>(work: () => Promise<T>): Promise<T> {
    return RequestContext.create(this.orm.em, work);
  }

  private readProfile(ctx: Context): TelegramProfile | undefined {
    if (!ctx.from) return undefined;
    return { firstName: ctx.from.first_name, lastName: ctx.from.last_name, username: ctx.from.username };
  }

  private async resolveBotReply(
    aiResponse: any,
    telegramUserId: string,
    activeBooking: BookingProcess | null,
    userText: string,
    history: ChatMessage[],
  ): Promise<string> {
    switch (aiResponse.action) {
      case ChatAction.SEARCH_AVAILABILITY:
        return this.resolveSearchAvailability(aiResponse.datos, telegramUserId, activeBooking, userText, history);
      case ChatAction.CONFIRM_RESERVATION:
        return this.resolveConfirmReservation(aiResponse.datos, telegramUserId, activeBooking, escapeHtml(aiResponse.texto || ''));
      default:
        return escapeHtml(aiResponse.texto || '') || 'Disculpá, no entendí bien eso. ¿Podés reformularlo?';
    }
  }

  private async resolveSearchAvailability(
    datos: unknown,
    telegramUserId: string,
    activeBooking: BookingProcess | null,
    userText: string,
    history: ChatMessage[],
  ): Promise<string> {
    const searchDto = plainToInstance(SearchAvailabilityDto, datos);
    const validationErrors = await validate(searchDto);
    if (validationErrors.length > 0) {
      const [firstError] = validationErrors;
      throw new Error(Object.values(firstError.constraints || {})[0] || 'Datos de búsqueda de disponibilidad inválidos');
    }

    // Si ya le ofrecimos esa misma habitación y estamos esperando su respuesta, un "sí" no es un
    // pedido de búsqueda nueva: es la aceptación. Repetir la oferta deja la charla en bucle.
    if (this.isOfferAlreadyPending(activeBooking, searchDto)) {
      this.logger.log(`Se ignora una búsqueda repetida de ${telegramUserId}: ya hay una oferta esperando confirmación`);
      return TelegramUpdate.ASK_GUEST_DATA;
    }

    const result = await this.reservationService.searchAvailability(telegramUserId, activeBooking, searchDto);
    if (result.available) return result.reply;

    if (result.alternatives.length === 0) {
      return `Lamentablemente no nos quedan habitaciones para ${searchDto.capacity} personas en esas fechas ni en los ${ALTERNATIVE_DATES_WINDOW_DAYS} días cercanos. ¿Probamos con otras fechas?`;
    }

    const aiReply = await this.ragService.composeUnavailableReply(userText, history, searchDto, result.alternatives);
    return escapeHtml(aiReply || '') || this.formatAlternativesFallback(result.alternatives);
  }

  /** Por si Gemini no devuelve texto: listamos las alternativas tal cual las calculó el backend. */
  private formatAlternativesFallback(alternatives: AlternativeDates[]): string {
    const options = alternatives.map(({ checkIn, checkOut, nights, isShorterStay, roomCategory, totalAmount }) =>
      `• Del ${checkIn} al ${checkOut} (${nights} noches${isShorterStay ? ', estadía más corta' : ''}) – ${escapeHtml(roomCategory)}, total $${totalAmount}`,
    );
    return [
      'Lamentablemente no tenemos lugar en esas fechas, pero encontré estas opciones cercanas:',
      ...options,
      '',
      '¿Te sirve alguna?',
    ].join('\n');
  }

  /** La búsqueda repite, dato por dato, la oferta que el huésped todavía no respondió. */
  private isOfferAlreadyPending(activeBooking: BookingProcess | null, searchDto: SearchAvailabilityDto): boolean {
    return !!activeBooking
      && activeBooking.step === BookingProcessStep.PENDING_CONFIRMATION
      && activeBooking.checkIn === searchDto.checkIn
      && activeBooking.checkOut === searchDto.checkOut
      && activeBooking.capacity === searchDto.capacity;
  }

  private async resolveConfirmReservation(datos: unknown, telegramUserId: string, activeBooking: BookingProcess | null, fallbackReply: string): Promise<string> {
    if (!activeBooking || activeBooking.step !== BookingProcessStep.PENDING_CONFIRMATION) {
      return fallbackReply || 'Ya procesamos esa reserva. Si necesitás algo más, decime.';
    }

    const confirmDto = plainToInstance(ConfirmReservationDto, datos);
    const validationErrors = await validate(confirmDto);
    if (validationErrors.length > 0) {
      // Apenas el huésped acepta, el modelo a veces llama a confirm_reservation sin tener todavía
      // el nombre o el DNI. Cortar con un error técnico ahí es peor que seguir pidiendo los datos.
      const invalidFields = validationErrors.map((error) => error.property);
      this.logger.warn(`Confirmación incompleta de ${telegramUserId}; faltan o son inválidos: ${invalidFields.join(', ')}`);

      if (!invalidFields.includes('fullName')) return '¿Me pasás el DNI del huésped que se aloja? Solo los números, sin puntos.';
      if (!invalidFields.includes('dni')) return '¿Me pasás el nombre completo del huésped que se aloja?';
      return TelegramUpdate.ASK_GUEST_DATA;
    }

    return this.reservationService.confirmReservation(telegramUserId, activeBooking, confirmDto);
  }
}
