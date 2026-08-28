import { Update, Ctx, Start, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { EntityManager } from '@mikro-orm/core';
import { RagService } from '../rag/rag.service';
import { ChatMessage, MessageRole } from '../../infrastructure/database/entities/ChatMessage.entity';

@Update()
export class TelegramUpdate {
  constructor(
    private readonly ragService: RagService,
    private readonly em: EntityManager 
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply('¡Hola! Soy Chamber, tu asistente virtual. ¿En qué puedo ayudarte?');
  }

  @On('text')
  async onMessage(@Message('text') text: string, @Ctx() ctx: Context) {
    if (!ctx.from) return;

    const telegramUserId = ctx.from.id.toString();

    await ctx.sendChatAction('typing'); 

    try {
      const userMessage = this.em.create(ChatMessage, {
        telegramUserId,
        role: MessageRole.USER,
        content: text,
      });
      this.em.persist(userMessage);

      const respuesta = await this.ragService.askQuestion(text);

      const botMessage = this.em.create(ChatMessage, {
        telegramUserId,
        role: MessageRole.BOT,
        content: respuesta,
      });
      this.em.persist(botMessage);

      await this.em.flush();

      await ctx.reply(respuesta);

    } catch (error) {
      console.error('Error en Telegram:', error);
      await ctx.reply('Hubo un error al procesar tu consulta.');
    }
  }
}