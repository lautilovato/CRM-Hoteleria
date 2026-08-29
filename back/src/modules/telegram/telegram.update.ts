import { Update, Ctx, Start, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { EntityManager } from '@mikro-orm/core';
import { RagService } from '../rag/rag.service';
import { ChatMessage, MessageRole } from '../../infrastructure/database/entities/ChatMessage.entity';
import { BookingProcess } from '../../infrastructure/database/entities/BookingProcess.entity';
import { Room } from '../../infrastructure/database/entities/Room.entity';
import { Reservation, ReservationStatus } from '../../infrastructure/database/entities/Reservation.entity';

@Update()
export class TelegramUpdate {
  constructor(private readonly ragService: RagService, private readonly em: EntityManager) {}

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
      const activeBooking = await this.em.findOne(BookingProcess, { 
        telegramUserId, 
        step: { $in: ['IN_PROGRESS', 'PENDING_CONFIRMATION'] } 
      });
      
      const lastCompletedBooking = await this.em.findOne(
        BookingProcess, { telegramUserId, step: 'COMPLETED' }, { orderBy: { createdAt: 'DESC' } }
      );

      const previousMessages = await this.em.find(
        ChatMessage, { telegramUserId }, { orderBy: { createdAt: 'DESC' }, limit: 6 }
      );
      
      const userMessage = this.em.create(ChatMessage, { telegramUserId, role: MessageRole.USER, content: text });
      this.em.persist(userMessage);

      const aiResponse = await this.ragService.askQuestion(text, activeBooking, previousMessages.reverse(), lastCompletedBooking);

      let botReply = aiResponse.texto;

      if (aiResponse.accion === 'BUSCAR_DISPONIBILIDAD') {
        const { checkIn, checkOut, capacidad } = aiResponse.datos;

        let booking = activeBooking || this.em.create(BookingProcess, { telegramUserId, step: 'IN_PROGRESS' });
        booking.checkIn = checkIn;
        booking.checkOut = checkOut;
        booking.roomType = capacidad.toString(); 
        
        const overlappingReservations = await this.em.find(Reservation, {
          $and: [{ checkIn: { $lt: new Date(checkOut) } }, { checkOut: { $gt: new Date(checkIn) } }]
        }, { populate: ['room'] });

        const reservedRoomIds = overlappingReservations.map(r => r.room.id);

        const availableRooms = await this.em.find(Room, {
          category: { capacity: { $gte: capacidad } }, 
          ...(reservedRoomIds.length > 0 ? { id: { $nin: reservedRoomIds } } : {})
        }, { populate: ['category'] });

        if (availableRooms.length > 0) {
          const [ roomFound ] = availableRooms; 
          
          booking.step = 'PENDING_CONFIRMATION'; 
          
          botReply = `¡Buenas noticias! Tenemos disponibilidad en nuestra ${roomFound.category.name} del ${checkIn} al ${checkOut} por $${roomFound.category.basePrice} la noche.\n\n¿Te gustaría que confirmemos la reserva?`;
        } else {
          booking.step = 'IN_PROGRESS';
          botReply = `Lamentablemente no nos quedan habitaciones para ${capacidad} personas en esas fechas. ¿Buscamos otras fechas?`;
        }
        this.em.persist(booking);
      }

      if (aiResponse.accion === 'CONFIRMAR_RESERVA' && activeBooking && activeBooking.step === 'PENDING_CONFIRMATION') {
        
        const savedCheckIn = activeBooking.checkIn as string;
        const savedCheckOut = activeBooking.checkOut as string;
        const capacidad = parseInt(activeBooking.roomType as string);

        const overlappingReservations = await this.em.find(Reservation, {
          $and: [{ checkIn: { $lt: new Date(savedCheckOut) } }, { checkOut: { $gt: new Date(savedCheckIn) } }]
        }, { populate: ['room'] });
        
        const reservedRoomIds = overlappingReservations.map(r => r.room.id);
        
        const availableRooms = await this.em.find(Room, {
          category: { capacity: { $gte: capacidad } }, 
          ...(reservedRoomIds.length > 0 ? { id: { $nin: reservedRoomIds } } : {})
        }, { populate: ['category'] });

        if (availableRooms.length > 0) {
          const [ roomToBook ] = availableRooms;
          
          const checkInDate = new Date(savedCheckIn);
          const checkOutDate = new Date(savedCheckOut);
          const nights = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 3600 * 24);
          const totalAmount = roomToBook.category.basePrice * nights;

          const newReservation = this.em.create(Reservation, {
            room: roomToBook,
            telegramUserId,
            checkIn: checkInDate,
            checkOut: checkOutDate,
            totalAmount: totalAmount,
            status: ReservationStatus.PENDING_PAYMENT
          });
          
          this.em.persist(newReservation);
          activeBooking.step = 'COMPLETED';

          botReply = `¡Listo! Tu reserva en la ${roomToBook.category.name} ha sido confirmada con éxito del ${savedCheckIn} al ${savedCheckOut}. El total a abonar será de $${totalAmount}. ¡Te esperamos!`;
        } else {
          botReply = `Uy, parece que alguien acaba de reservar la última habitación disponible para esas fechas mientras hablábamos. ¿Te gustaría buscar otra fecha?`;
          activeBooking.step = 'IN_PROGRESS';
        }
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