import { Update, Ctx, Start, On, Message } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { RagService } from '../rag/rag.service';

@Update()
export class TelegramUpdate {
  constructor(private readonly ragService: RagService) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply('¡Hola! Soy Chamber, tu asistente virtual. ¿Qué dudas tienes?');
  }

  @On('text')
  async onMessage(@Message('text') text: string, @Ctx() ctx: Context) {
    await ctx.sendChatAction('typing');
    try {
      const respuesta = await this.ragService.askQuestion(text);
      await ctx.reply(respuesta);
    } catch (error) {
      console.error('Error en Telegram:', error);
      await ctx.reply('Hubo un error al procesar tu consulta.');
    }
  }
}