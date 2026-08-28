import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { RagRepository } from './rag.repository';

@Injectable()
export class RagService {
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly ragRepository: RagRepository,
    private readonly configService: ConfigService,
  ) {
    
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('The GEMINI_API_KEY variable needs to be configured in the .env file.');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async ingestDocument(rawText: string): Promise<void> {
    const chunks = this.chunkText(rawText, 1000, 200);

    const embeddingModel = this.genAI.getGenerativeModel({ model: 'gemini-embedding-2' });

    for (const chunk of chunks) {
      const result = await embeddingModel.embedContent(chunk);
      const embeddingVector = result.embedding.values;

      await this.ragRepository.saveDocumentChunk(chunk, embeddingVector);
    }
  }

  async askQuestion(userQuestion: string, reservaActiva: any = null, history: any[] = []): Promise<any> {
    const embeddingModel = this.genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
    const result = await embeddingModel.embedContent(userQuestion);
    
    const similarDocs = await this.ragRepository.findSimilar(result.embedding.values, 3);
    const contextText = similarDocs.map(doc => doc.content).join('\n\n---\n\n');

    const contextoReserva = reservaActiva
      ? `\n[FALTAN DATOS DE RESERVA: CheckIn=${reservaActiva.checkIn || 'No'}, CheckOut=${reservaActiva.checkOut || 'No'}, Tipo=${reservaActiva.roomType || 'No'}]`
      : '';

    const historyText = history.map(msg => `${msg.role === 'USER' ? 'Usuario' : 'Chamber'}: ${msg.content}`).join('\n');

    const chatModel = this.genAI.getGenerativeModel({ 
      model: 'gemini-flash-lite-latest',
      systemInstruction: `Eres Chamber, el asistente virtual y conserje digital del hotel. Estás a entera disposición de los clientes para ayudarles de forma amable, servicial y profesional, manteniendo una charla natural y NO robótica. Responde a la pregunta del usuario utilizando ÚNICAMENTE la siguiente información provista en el contexto. SOLO si te saludan, preséntate como Chamber. Si la respuesta a una pregunta no está en el contexto, di "Lamentablemente no tengo esa información en este momento, pero puedo derivarte a la recepción".\n\nREGLA PARA RESERVAS: Si el usuario quiere reservar y faltan datos (fecha de llegada, fecha de salida o tipo de habitación), pregúntalos sutilmente integrándolos en la charla. Cuando ya tengas los 3 datos identificados, utiliza la herramienta 'procesar_reserva'.\n\nCONTEXTO:\n${contextText}`,
      tools: [{
        functionDeclarations: [{
          name: 'procesar_reserva',
          description: 'Llama a esta función ÚNICAMENTE cuando ya tengas identificados los 3 datos limpios del cliente.',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              checkIn: { type: SchemaType.STRING, description: 'Fecha de entrada limpia. Ej: "27 de noviembre"' },
              checkOut: { type: SchemaType.STRING, description: 'Fecha de salida limpia. Ej: "08 de diciembre"' },
              tipoHabitacion: { type: SchemaType.STRING, description: 'Tipo de habitación. Ej: "Suite"' }
            },
            required: ['checkIn', 'checkOut', 'tipoHabitacion']
          }
        }]
      }]
    });

    const prompt = `Historial de la conversación:\n${historyText}\n\nContexto del hotel:\n${contextoReserva}\n\nMensaje del usuario: ${userQuestion}`;
    
    const chatResponse = await chatModel.generateContent(prompt);
    
    const functionCall = chatResponse.response.functionCalls()?.[0];
    if (functionCall && functionCall.name === 'procesar_reserva') {
      return { accion: 'RESERVAR', datos: functionCall.args };
    }

    return { accion: 'RESPONDER', texto: chatResponse.response.text() };
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      let end = i + chunkSize;
      chunks.push(text.substring(i, end));
      i += (chunkSize - overlap);
    }
    return chunks;
  }
}