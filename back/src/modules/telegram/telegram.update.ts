import { Update, Ctx, Start, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { EntityManager } from '@mikro-orm/core';
import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RagService, ChatAction } from '../rag/rag.service';
import { ReservationService, AlternativeDates, ALTERNATIVE_DATES_WINDOW_DAYS } from '../reservation/reservation.service';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { SearchAvailabilityDto } from '../bookingProcess/dto/searchAvailability.dto';
import { ConfirmReservationDto } from '../reservation/dto/confirmReservation.dto';
import { ChatMessage, MessageRole } from '../../infrastructure/database/entities/ChatMessage.entity';
import { BookingProcess, BookingProcessStep } from '../../infrastructure/database/entities/BookingProcess.entity';
import { escapeHtml } from './telegram.format';

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
    private readonly em: EntityManager,
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply('¡Hola! Soy Chamber , el asistente virtual del hotel. ¿En qué puedo ayudarte?');
  }

  @On('text')
  async onMessage(@Message('text') text: string, @Ctx() ctx: Context) {
    if (!ctx.from) return;
    const telegramUserId = ctx.from.id.toString();
    await ctx.sendChatAction('typing');

    try {
      const activeBooking = await this.bookingProcessService.getActive(telegramUserId);
      const lastCompletedBooking = await this.bookingProcessService.getLastCompleted(telegramUserId);

      const previousMessages = await this.em.find(
        ChatMessage, { telegramUserId }, { orderBy: { createdAt: 'DESC' }, limit: 6 }
      );

      const userMessage = this.em.create(ChatMessage, { telegramUserId, role: MessageRole.USER, content: text });
      this.em.persist(userMessage);

      const history = previousMessages.reverse();
      const aiResponse = await this.ragService.askQuestion(text, activeBooking, history, lastCompletedBooking);

      const botReply = (await this.resolveBotReply(aiResponse, telegramUserId, activeBooking, text, history))
        || 'Disculpá, no pude procesar tu mensaje. ¿Podés reformularlo?';

      const botMessage = this.em.create(ChatMessage, { telegramUserId, role: MessageRole.BOT, content: botReply });
      this.em.persist(botMessage);

      await this.em.flush();

      // El texto viaja como HTML para que el link de pago sea clickeable; todo lo que no armamos
      // nosotros (texto de la IA) ya viene escapado desde resolveBotReply.
      await ctx.reply(botReply, { parse_mode: 'HTML' });

    } catch (error: any) {
        this.logger.error(`Error procesando el mensaje: ${error}`);
        if (error?.status === 503) {
          await ctx.reply('El sistema está experimentando alta demanda en este segundo. Dame un minutito y volvé a escribirme.');
        } else {
          await ctx.reply('Hubo un error técnico al procesar tu consulta. Por favor, intentá nuevamente.');
        }
    }
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
