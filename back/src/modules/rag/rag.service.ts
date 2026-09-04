import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { RagRepository } from './rag.repository';
import { formatDate } from '../bookingProcess/date.util';

export enum ChatAction {
  SEARCH_AVAILABILITY = 'SEARCH_AVAILABILITY',
  CONFIRM_RESERVATION = 'CONFIRM_RESERVATION',
  REPLY = 'REPLY',
}

@Injectable()
export class RagService {
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly ragRepository: RagRepository,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY');
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

  async askQuestion(userQuestion: string, reservaActiva: any = null, history: any[] = [], ultimaCompletada: any = null): Promise<any> {
    const embeddingModel = this.genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
    const result = await embeddingModel.embedContent(userQuestion);
    
    const similarDocs = await this.ragRepository.findSimilar(result.embedding.values, 3);
    const contextText = similarDocs.map(doc => doc.content).join('\n\n---\n\n');

    let contextoReserva = '';
    if (reservaActiva) {
      contextoReserva = `\n[ESTADO ACTUAL: Faltan datos. CheckIn=${reservaActiva.checkIn || 'No'}, CheckOut=${reservaActiva.checkOut || 'No'}, Capacidad=${reservaActiva.capacity || 'No'}]`;
    } else if (ultimaCompletada) {
      contextoReserva = `\n[ESTADO ACTUAL: La reserva del ${ultimaCompletada.checkIn} al ${ultimaCompletada.checkOut} ya fue confirmada. PROHIBIDO usar las herramientas para estos datos.]`;
    }

    const historyText = history.map(msg => `${msg.role === 'USER' ? 'Usuario' : 'Chamber'}: ${msg.content}`).join('\n');

    const chatModel = this.genAI.getGenerativeModel({ 
      model: 'gemini-flash-lite-latest',
      systemInstruction: `Eres Chamber, el asistente virtual del hotel. Estás a entera disposición de los clientes para ayudarles de forma amable, servicial y profesional, manteniendo una charla natural y NO robótica. Responde a la pregunta del usuario utilizando ÚNICAMENTE la siguiente información provista en el contexto. Si la respuesta a una pregunta no está en el contexto, di "Lamentablemente no tengo esa información en este momento, pero puedo derivarte a la recepción"...\n\nFECHA ACTUAL: ${formatDate(new Date())}.\n\nREGLA PARA RESERVAS: Si faltan datos, pregúntalos. Las fechas siempre deben pedirse y enviarse en formato DD-MM-YYYY. Si el usuario no menciona el año, asumí que es el año actual (según la FECHA ACTUAL); si la fecha resultante ya pasó este año, asumí el año siguiente. Cuando tengas los 3 (entrada, salida, capacidad), usa 'search_availability'. Si ya le ofreciste una habitación y el usuario acepta o confirma explícitamente, usa 'confirm_reservation'.\n\nCONTEXTO:\n${contextText}`,
      tools: [{
        functionDeclarations: [
          {
            name: 'search_availability',
            description: 'Llama a esta función para buscar disponibilidad.',
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                checkIn: { type: SchemaType.STRING, description: 'Fecha entrada DD-MM-YYYY.' },
                checkOut: { type: SchemaType.STRING, description: 'Fecha salida DD-MM-YYYY.' },
                capacity: { type: SchemaType.INTEGER, description: 'Cantidad de personas.' }
              },
              required: ['checkIn', 'checkOut', 'capacity']
            }
          },
          {
            name: 'confirm_reservation',
            description: 'Llama a esta función ÚNICAMENTE cuando el usuario acepte confirmar la reserva previamente ofrecida.',
          }
        ]
      }]
    });

    const prompt = `Historial de la conversación:\n${historyText}\n\nContexto del sistema:\n${contextoReserva}\n\nMensaje del usuario: ${userQuestion}`;
    
    const chatResponse = await chatModel.generateContent(prompt);
    
    const [functionCall] = chatResponse.response.functionCalls() || [];

    if (functionCall) {
      const { name, args } = functionCall; 
      
      if (name === 'search_availability') return { action: ChatAction.SEARCH_AVAILABILITY, datos: args };
      if (name === 'confirm_reservation') return { action: ChatAction.CONFIRM_RESERVATION };
    }

    return { action: ChatAction.REPLY, texto: chatResponse.response.text() };
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