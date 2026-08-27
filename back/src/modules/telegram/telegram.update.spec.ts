import { Test, TestingModule } from '@nestjs/testing';
import { TelegramUpdate } from './telegram.update';
import { RagService } from '../rag/rag.service';
import { Context } from 'telegraf';

describe('TelegramUpdate', () => {
  let update: TelegramUpdate;
  let ragService: RagService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramUpdate,
        {
          // mock service
          provide: RagService,
          useValue: {
            askQuestion: jest.fn(), 
          },
        },
      ],
    }).compile();

    update = module.get<TelegramUpdate>(TelegramUpdate);
    ragService = module.get<RagService>(RagService);
  });

  it('It should be predefined', () => {
    expect(update).toBeDefined();
  });

  it('should respond with the result of the service when receiving a message', async () => {
    const mockTexto = 'How does the RAG system work?';
    const mockRespuesta = 'The RAG system works by retrieving relevant information from a knowledge base and generating answers based on that information.';

    jest.spyOn(ragService, 'askQuestion').mockResolvedValue(mockRespuesta);

    // Mock Telegram Context 
    const mockCtx = {
      sendChatAction: jest.fn(),
      reply: jest.fn(),
    } as unknown as Context; 

    // Act
    await update.onMessage(mockTexto, mockCtx);

    // Verify
    expect(mockCtx.sendChatAction).toHaveBeenCalledWith('typing');
    expect(ragService.askQuestion).toHaveBeenCalledWith(mockTexto);
    expect(mockCtx.reply).toHaveBeenCalledWith(mockRespuesta);
  });
});