import { Update, Ctx, Start, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { EntityManager } from '@mikro-orm/core';
import { RagService } from '../rag/rag.service';
import { ChatMessage, MessageRole } from '../../infrastructure/database/entities/ChatMessage.entity';
import { BookingProcess } from '../../infrastructure/database/entities/BookingProcess.entity';

@Update()
export class TelegramUpdate {
  constructor(
    private readonly ragService: RagService,
    private readonly em: EntityManager 
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
      const activeBooking = await this.em.findOne(BookingProcess, { telegramUserId, step: 'IN_PROGRESS' });

      const previousMessages = await this.em.find(
        ChatMessage,
        { telegramUserId },
        { orderBy: { createdAt: 'DESC' }, limit: 6 }
      );
      const history = previousMessages.reverse();

      const userMessage = this.em.create(ChatMessage, { telegramUserId, role: MessageRole.USER, content: text });
      this.em.persist(userMessage);

      const aiResponse = await this.ragService.askQuestion(text, activeBooking, history);

      if (aiResponse.accion === 'RESERVAR') {
        const { checkIn, checkOut, tipoHabitacion } = aiResponse.datos;

        let booking = activeBooking || this.em.create(BookingProcess, { telegramUserId, step: 'IN_PROGRESS' });
        booking.checkIn = checkIn;
        booking.checkOut = checkOut;
        booking.roomType = tipoHabitacion;
        booking.step = 'COMPLETED';
        this.em.persist(booking);

        const botReply = `¡Perfecto! Ya tengo todos tus datos: una ${tipoHabitacion} del ${checkIn} al ${checkOut}. Dame un segundo que consulto la disponibilidad en el sistema...`;

        const botMessage = this.em.create(ChatMessage, { telegramUserId, role: MessageRole.BOT, content: botReply });
        this.em.persist(botMessage);

        await this.em.flush();
        await ctx.reply(botReply);
        return;
      }

      if (!activeBooking && aiResponse.texto.toLowerCase().includes('fecha')) {
         const newBooking = this.em.create(BookingProcess, { telegramUserId, step: 'IN_PROGRESS' });
         this.em.persist(newBooking);
      }

      const botMessage = this.em.create(ChatMessage, { telegramUserId, role: MessageRole.BOT, content: aiResponse.texto });
      this.em.persist(botMessage);

      await this.em.flush();
      await ctx.reply(aiResponse.texto);

    } catch (error) {
      console.error('Error:', error);
      await ctx.reply('Hubo un error al procesar tu consulta.');
    }
  }
}