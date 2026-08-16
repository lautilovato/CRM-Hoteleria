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
    // Inicializamos el SDK de Gemini
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('The GEMINI_API_KEY variable needs to be configured in the .env file.');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async ingestDocument(rawText: string): Promise<void> {
    const chunks = this.chunkText(rawText, 1000, 200);

    // Usamos el modelo específico de embeddings de Gemini
    const embeddingModel = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });

    for (const chunk of chunks) {
      const result = await embeddingModel.embedContent(chunk);
      const embeddingVector = result.embedding.values;

      await this.ragRepository.saveDocumentChunk(chunk, embeddingVector);
    }
  }

  async askQuestion(userQuestion: string): Promise<string> {
    // 1. Vectorizar la pregunta
    const embeddingModel = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await embeddingModel.embedContent(userQuestion);
    const questionVector = result.embedding.values;

    // 2. Buscar similitudes en la BD
    const similarDocs = await this.ragRepository.findSimilar(questionVector, 3);
    const contextText = similarDocs.map(doc => doc.content).join('\n\n---\n\n');

    // 3. Generar la respuesta usando el modelo de texto de Gemini (ej. gemini-1.5-flash es gratis y rapidísimo)
    const chatModel = this.genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: `Eres un asistente experto. Responde a la pregunta utilizando ÚNICAMENTE la siguiente información. Si no está en el contexto, di "No tengo suficiente información".\n\nCONTEXTO:\n${contextText}`
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