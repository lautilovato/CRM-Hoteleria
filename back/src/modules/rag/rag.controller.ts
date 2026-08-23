import { Controller, Post, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { RagService } from './rag.service';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  async ingestData(@Body('text') text: string) {
    if (!text) {
      throw new BadRequestException('El campo "text" es obligatorio en el body');
    }

    await this.ragService.ingestDocument(text);
    
    return { 
      message: 'Documento particionado, vectorizado y guardado con éxito.',
      status: 'success'
    };
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async askQuestion(@Body('question') question: string) {
    if (!question) {
      throw new BadRequestException('El campo "question" es obligatorio en el body');
    }
    const answer = await this.ragService.askQuestion(question);
    
    return { 
      question,
      answer,
    };
  }
}