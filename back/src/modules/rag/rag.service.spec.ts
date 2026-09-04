import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { RagService, ChatAction } from './rag.service';
import { RagRepository } from './rag.repository';
import { formatDate } from '../bookingProcess/date.util';

jest.mock('@google/generative-ai', () => {
  const actual = jest.requireActual('@google/generative-ai');
  return {
    ...actual,
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn(),
    })),
  };
});

describe('RagService', () => {
  let service: RagService;
  let ragRepository: RagRepository;
  let getGenerativeModelMock: jest.Mock;
  let embeddingModelMock: { embedContent: jest.Mock };
  let chatModelMock: { generateContent: jest.Mock };

  const buildModule = async (apiKey: string | undefined = 'fake-api-key') => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(apiKey) } },
        {
          provide: RagRepository,
          useValue: {
            findSimilar: jest.fn().mockResolvedValue([]),
            saveDocumentChunk: jest.fn().mockResolvedValue(undefined),
            countDocuments: jest.fn(),
          },
        },
      ],
    }).compile();

    return module;
  };

  beforeEach(async () => {
    embeddingModelMock = { embedContent: jest.fn().mockResolvedValue({ embedding: { values: [0.1, 0.2] } }) };
    chatModelMock = { generateContent: jest.fn() };
    getGenerativeModelMock = jest.fn().mockImplementation((config: { model: string }) =>
      config.model === 'gemini-embedding-2' ? embeddingModelMock : chatModelMock
    );

    const module = await buildModule();
    service = module.get<RagService>(RagService);
    ragRepository = module.get<RagRepository>(RagRepository);

    const MockedGoogleGenerativeAI = GoogleGenerativeAI as unknown as jest.Mock;
    const lastInstance = MockedGoogleGenerativeAI.mock.results[MockedGoogleGenerativeAI.mock.results.length - 1].value;
    lastInstance.getGenerativeModel = getGenerativeModelMock;
  });

  it('lanza un error en el constructor si falta GEMINI_API_KEY', () => {
    const fakeConfigService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const fakeRagRepository = {} as RagRepository;

    expect(() => new RagService(fakeRagRepository, fakeConfigService)).toThrow('Falta GEMINI_API_KEY');
  });

  describe('askQuestion', () => {
    const mockChatResponse = (functionCalls: any[], texto = '') => ({
      response: {
        functionCalls: () => functionCalls,
        text: () => texto,
      },
    });

    it('devuelve REPLY con el texto generado cuando no hay function call', async () => {
      chatModelMock.generateContent.mockResolvedValue(mockChatResponse([], 'Hola, soy Chamber'));

      const result = await service.askQuestion('¿Cuáles son los horarios?');

      expect(result).toEqual({ action: ChatAction.REPLY, texto: 'Hola, soy Chamber' });
    });

    it('devuelve SEARCH_AVAILABILITY con los datos de la function call', async () => {
      const datos = { checkIn: '10-10-2026', checkOut: '15-10-2026', capacity: 2 };
      chatModelMock.generateContent.mockResolvedValue(
        mockChatResponse([{ name: 'search_availability', args: datos }])
      );

      const result = await service.askQuestion('Quiero reservar para 2');

      expect(result).toEqual({ action: ChatAction.SEARCH_AVAILABILITY, datos });
    });

    it('devuelve CONFIRM_RESERVATION cuando la function call es confirm_reservation', async () => {
      chatModelMock.generateContent.mockResolvedValue(mockChatResponse([{ name: 'confirm_reservation' }]));

      const result = await service.askQuestion('Sí, confirmo');

      expect(result).toEqual({ action: ChatAction.CONFIRM_RESERVATION });
    });

    it('incluye la fecha actual en las instrucciones del sistema', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 8, 4, 12, 0, 0));
      chatModelMock.generateContent.mockResolvedValue(mockChatResponse([], 'ok'));

      await service.askQuestion('¿Tienen disponibilidad?');

      const chatConfig = getGenerativeModelMock.mock.calls.find(([config]) => config.model !== 'gemini-embedding-2')[0];
      expect(chatConfig.systemInstruction).toContain(`FECHA ACTUAL: ${formatDate(new Date())}`);

      jest.useRealTimers();
    });

    it('incluye el estado de la reserva activa en el prompt cuando hay una en curso', async () => {
      chatModelMock.generateContent.mockResolvedValue(mockChatResponse([], 'ok'));

      const reservaActiva = { checkIn: '10-10-2026', checkOut: null, capacity: 2 };
      await service.askQuestion('Quiero agregar el checkout', reservaActiva);

      const prompt = chatModelMock.generateContent.mock.calls[0][0];
      expect(prompt).toContain('ESTADO ACTUAL: Faltan datos');
      expect(prompt).toContain('CheckIn=10-10-2026');
      expect(prompt).toContain('CheckOut=No');
    });

    it('prohíbe reutilizar los datos de una reserva ya completada', async () => {
      chatModelMock.generateContent.mockResolvedValue(mockChatResponse([], 'ok'));

      const ultimaCompletada = { checkIn: '01-01-2026', checkOut: '05-01-2026' };
      await service.askQuestion('Hola de nuevo', null, [], ultimaCompletada);

      const prompt = chatModelMock.generateContent.mock.calls[0][0];
      expect(prompt).toContain('ya fue confirmada');
      expect(prompt).toContain('PROHIBIDO usar las herramientas');
    });
  });

  describe('ingestDocument', () => {
    it('vectoriza y guarda un único chunk cuando el texto es corto', async () => {
      await service.ingestDocument('Un texto corto para ingestar.');

      expect(embeddingModelMock.embedContent).toHaveBeenCalledTimes(1);
      expect(ragRepository.saveDocumentChunk).toHaveBeenCalledTimes(1);
      expect(ragRepository.saveDocumentChunk).toHaveBeenCalledWith('Un texto corto para ingestar.', [0.1, 0.2]);
    });

    it('particiona el texto en varios chunks cuando excede el tamaño configurado', async () => {
      const longText = 'a'.repeat(1500);

      await service.ingestDocument(longText);

      expect(embeddingModelMock.embedContent).toHaveBeenCalledTimes(2);
      expect(ragRepository.saveDocumentChunk).toHaveBeenCalledTimes(2);
    });
  });
});
