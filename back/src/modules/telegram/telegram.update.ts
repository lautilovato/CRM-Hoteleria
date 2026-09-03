import { Update, Ctx, Start, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { EntityManager } from '@mikro-orm/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RagService } from '../rag/rag.service';
import { ReservationService } from '../reservation/reservation.service';
import { BookingProcessService } from '../bookingProcess/bookingProcess.service';
import { SearchAvailabilityDto } from '../bookingProcess/dto/searchAvailability.dto';
import { ChatMessage, MessageRole } from '../../infrastructure/database/entities/ChatMessage.entity';
import { BookingProcessStep } from '../../infrastructure/database/entities/BookingProcess.entity';

@Update()
export class TelegramUpdate {
  constructor(
    private readonly ragService: RagService,
    private readonly reservationService: ReservationService,
    private readonly bookingProcessService: BookingProcessService,
    private readonly em: EntityManager,
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply('¡Hola! Soy Chamber. ¿En qué puedo ayudarte hoy?');
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

      const aiResponse = await this.ragService.askQuestion(text, activeBooking, previousMessages.reverse(), lastCompletedBooking);

      let botReply = aiResponse.texto;

      if (aiResponse.accion === 'BUSCAR_DISPONIBILIDAD') {
        const searchDto = plainToInstance(SearchAvailabilityDto, aiResponse.datos);
        const validationErrors = await validate(searchDto);
        if (validationErrors.length > 0) {
          const [firstError] = validationErrors;
          throw new Error(Object.values(firstError.constraints || {})[0] || 'Datos de búsqueda de disponibilidad inválidos');
        }

        botReply = await this.reservationService.searchAvailability(telegramUserId, activeBooking, searchDto);
      }

      if (aiResponse.accion === 'CONFIRMAR_RESERVA' && activeBooking && activeBooking.step === BookingProcessStep.PENDING_CONFIRMATION) {
        botReply = await this.reservationService.confirmReservation(telegramUserId, activeBooking);
      }

      if (aiResponse.accion !== 'RESPONDER' && !botReply) botReply = aiResponse.texto;
      
      const botMessage = this.em.create(ChatMessage, { telegramUserId, role: MessageRole.BOT, content: botReply });
      this.em.persist(botMessage);

      await this.em.flush();
      await ctx.reply(botReply);

    } catch (error: any) {
        console.error('Error:', error);
        if (error?.status === 503) {
          await ctx.reply('El sistema está experimentando alta demanda en este segundo. Dame un minutito y volvé a escribirme.');
        } else {
          await ctx.reply('Hubo un error técnico al procesar tu consulta. Por favor, intentá nuevamente.');
        }
    }
  }
}