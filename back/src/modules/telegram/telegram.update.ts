import { Update, Ctx, Start, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { EntityManager } from '@mikro-orm/core';
import { RagService } from '../rag/rag.service';
import { ChatMessage, MessageRole } from '../../infrastructure/database/entities/ChatMessage.entity';
import { BookingProcess } from '../../infrastructure/database/entities/BookingProcess.entity';
import { Room } from '../../infrastructure/database/entities/Room.entity';
import { Reservation } from '../../infrastructure/database/entities/Reservation.entity';


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
      
      const lastCompletedBooking = await this.em.findOne(
        BookingProcess, 
        { telegramUserId, step: 'COMPLETED' }, 
        { orderBy: { createdAt: 'DESC' } }
      );

      const previousMessages = await this.em.find(
        ChatMessage,
        { telegramUserId },
        { orderBy: { createdAt: 'DESC' }, limit: 6 }
      );
      const history = previousMessages.reverse();

      const userMessage = this.em.create(ChatMessage, { telegramUserId, role: MessageRole.USER, content: text });
      this.em.persist(userMessage);

      const aiResponse = await this.ragService.askQuestion(text, activeBooking, history, lastCompletedBooking);

      if (aiResponse.accion === 'RESERVAR') {
        const { checkIn, checkOut, capacidad, tipoHabitacion } = aiResponse.datos;

        let booking = activeBooking || this.em.create(BookingProcess, { telegramUserId, step: 'IN_PROGRESS' });
        booking.checkIn = checkIn;
        booking.checkOut = checkOut;
        booking.roomType = tipoHabitacion;
        booking.step = 'COMPLETED';
        this.em.persist(booking);
        
        await ctx.sendChatAction('typing');

        const overlappingReservations = await this.em.find(Reservation, {
          $and: [
            { checkIn: { $lt: new Date(checkOut) } },
            { checkOut: { $gt: new Date(checkIn) } }
          ]
        }, { populate: ['room'] });

        const reservedRoomIds = overlappingReservations.map(r => r.room.id);

        const availableRooms = await this.em.find(Room, {
          category: { capacity: { $gte: capacidad } }, 
          ...(reservedRoomIds.length > 0 ? { id: { $nin: reservedRoomIds } } : {})
        }, { populate: ['category'] });

        let botReply = '';

        if (availableRooms.length > 0) {
          const roomFound = availableRooms[0];
          const price = roomFound.category.basePrice;
          
          botReply = `¡Buenas noticias! Tenemos disponibilidad en nuestra ${roomFound.category.name} del ${checkIn} al ${checkOut}.\n\n` +
                     `El valor base es de $${price} por noche.\n\n` +
                     `¿Te gustaría que confirmemos la reserva?`;
        } else {
          botReply = `Lamentablemente no nos quedan habitaciones para ${capacidad} personas disponibles del ${checkIn} al ${checkOut}. ¿Buscamos en otras fechas?`;
        }

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