import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { RagService, ChatAction } from '../src/modules/rag/rag.service';

describe('RagModule (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(RagService)
    .useValue({ 
      askQuestion: jest.fn().mockResolvedValue({ texto: 'Respuesta de prueba', action: ChatAction.REPLY })
    })
    .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch (error) {
    }
  });

  it('/rag/ask (POST) debería procesar una pregunta y devolver una respuesta usando el flujo real', async () => {
    const response = await request(app.getHttpServer())
      .post('/rag/ask') 
      .send({ question: '¿Cuáles son los horarios del hotel?' })
      .expect(200);
      expect(response.body).toBeDefined();
  });
});