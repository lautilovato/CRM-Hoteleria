import { Controller, Post, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { RagService } from './rag.service';
import { IngestDataDto, AskQuestionDto } from './dto/rag.dto';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  async ingestData(@Body() ingestDataDto: IngestDataDto) {
    await this.ragService.ingestDocument(ingestDataDto.text);
        
    return { 
      message: 'Documento particionado, vectorizado y guardado con éxito.',
      status: 'success'
    };
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async askQuestion(@Body() askQuestionDto: AskQuestionDto) {
    const answer = await this.ragService.askQuestion(askQuestionDto.question);
    
    return { 
      question: askQuestionDto.question,
      answer,
    };
  }
}