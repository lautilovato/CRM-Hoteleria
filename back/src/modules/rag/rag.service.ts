import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

  async askQuestion(userQuestion: string): Promise<string> {

    const embeddingModel = this.genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
    const result = await embeddingModel.embedContent(userQuestion);
    const questionVector = result.embedding.values;

    const similarDocs = await this.ragRepository.findSimilar(questionVector, 3);
    const contextText = similarDocs.map(doc => doc.content).join('\n\n---\n\n');

    const chatModel = this.genAI.getGenerativeModel({ 
      model: 'gemini-flash-lite-latest',
      systemInstruction: `Eres Chamber, el asistente virtual y conserje digital del hotel. Estás a entera disposición de los clientes para ayudarles de forma amable, servicial y profesional. Responde a la pregunta del usuario utilizando ÚNICAMENTE la siguiente información provista en el contexto. Si te saludan, preséntate como Chamber. Si la respuesta a una pregunta no está en el contexto, di "Lamentablemente no tengo esa información en este momento, pero puedo derivarte a la recepción".\n\nCONTEXTO:\n${contextText}`    
    });

    const chatResponse = await chatModel.generateContent(userQuestion);
    return chatResponse.response.text();
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