import { Test, TestingModule } from '@nestjs/testing';
import { RagController } from './rag.controller';
import { RagService, ChatAction } from './rag.service';

describe('RagController', () => {
  let controller: RagController;
  let ragService: RagService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RagController],
      providers: [
        {
          provide: RagService,
          useValue: {
            ingestDocument: jest.fn().mockResolvedValue(undefined),
            askQuestion: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RagController>(RagController);
    ragService = module.get<RagService>(RagService);
  });

  describe('ingestData', () => {
    it('ingesta el texto recibido y confirma el resultado', async () => {
      const result = await controller.ingestData({ text: 'Un texto para vectorizar.' });

      expect(ragService.ingestDocument).toHaveBeenCalledWith('Un texto para vectorizar.');
      expect(result).toEqual({
        message: 'Documento particionado, vectorizado y guardado con éxito.',
        status: 'success',
      });
    });
  });

  describe('askQuestion', () => {
    it('devuelve la pregunta y la respuesta generada', async () => {
      jest.spyOn(ragService, 'askQuestion').mockResolvedValue({
        action: ChatAction.REPLY,
        texto: 'El check-in es a las 14hs.',
      } as any);

      const result = await controller.askQuestion({ question: '¿A qué hora es el check-in?' });

      expect(ragService.askQuestion).toHaveBeenCalledWith('¿A qué hora es el check-in?');
      expect(result).toEqual({
        question: '¿A qué hora es el check-in?',
        answer: { action: ChatAction.REPLY, texto: 'El check-in es a las 14hs.' },
      });
    });
  });
});
