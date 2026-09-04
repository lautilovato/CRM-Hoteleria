import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getBotToken } from 'nestjs-telegraf';
import { AppModule } from './../src/app.module';
import { RagService } from '../src/modules/rag/rag.service';
import { createValidationPipe } from '../src/validation.config';

describe('ValidationPipe global (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RagService)
      .useValue({ ingestDocument: jest.fn().mockResolvedValue(undefined), askQuestion: jest.fn().mockResolvedValue({}) })
      .overrideProvider(getBotToken())
      .useValue({ launch: jest.fn(), stop: jest.fn(), on: jest.fn(), start: jest.fn(), use: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } catch (e) {
    }
  });

  it('rechaza POST /rag/ingest con un texto más corto que el mínimo (400)', async () => {
    const response = await request(app.getHttpServer())
      .post('/rag/ingest')
      .send({ text: 'corto' })
      .expect(400);

    expect(response.body.message).toContain('mínimo 10 caracteres');
  });

  it('rechaza POST /rag/ingest sin el campo text (400)', async () => {
    await request(app.getHttpServer())
      .post('/rag/ingest')
      .send({})
      .expect(400);
  });

  it('rechaza POST /rag/ask con una pregunta más corta que el mínimo (400)', async () => {
    const response = await request(app.getHttpServer())
      .post('/rag/ask')
      .send({ question: 'hola' })
      .expect(400);

    expect(response.body.message).toContain('al menos 5 caracteres');
  });

  it('rechaza POST /rag/ask con campos no declarados en el DTO (400)', async () => {
    await request(app.getHttpServer())
      .post('/rag/ask')
      .send({ question: '¿Cuál es el horario del hotel?', campoExtra: 'no debería existir' })
      .expect(400);
  });

  it('acepta POST /rag/ask con un payload válido (200)', async () => {
    await request(app.getHttpServer())
      .post('/rag/ask')
      .send({ question: '¿Cuáles son los horarios del hotel?' })
      .expect(200);
  });
});
