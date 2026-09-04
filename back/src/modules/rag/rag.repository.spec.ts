import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { RagRepository } from './rag.repository';
import { Document } from '../../infrastructure/database/entities/Document.entity';

describe('RagRepository', () => {
  let repository: RagRepository;
  let em: EntityManager;
  let connection: { execute: jest.Mock };

  beforeEach(async () => {
    connection = { execute: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagRepository,
        {
          provide: EntityManager,
          useValue: {
            create: jest.fn().mockImplementation((_entity, data) => data),
            persist: jest.fn(),
            flush: jest.fn(),
            getConnection: jest.fn().mockReturnValue(connection),
            map: jest.fn().mockImplementation((_entity, row) => row),
            count: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<RagRepository>(RagRepository);
    em = module.get<EntityManager>(EntityManager);
  });

  describe('saveDocumentChunk', () => {
    it('formatea el embedding como vector y persiste el documento', async () => {
      const document = await repository.saveDocumentChunk('un fragmento', [0.1, 0.2, 0.3]);

      expect(em.create).toHaveBeenCalledWith(Document, { content: 'un fragmento', embedding: '[0.1,0.2,0.3]' });
      expect(em.persist).toHaveBeenCalledWith(document);
      expect(em.flush).toHaveBeenCalled();
    });
  });

  describe('findSimilar', () => {
    it('ejecuta la búsqueda por similitud de vectores con el límite indicado', async () => {
      const rows = [{ id: 1, content: 'texto' }];
      connection.execute.mockResolvedValue(rows);

      const results = await repository.findSimilar([0.1, 0.2], 3);

      expect(connection.execute).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY embedding <-> ?::vector'),
        ['[0.1,0.2]', 3],
      );
      expect(em.map).toHaveBeenCalledWith(Document, rows[0]);
      expect(results).toEqual(rows);
    });

    it('usa 5 como límite por defecto', async () => {
      await repository.findSimilar([0.1, 0.2]);

      expect(connection.execute).toHaveBeenCalledWith(expect.any(String), ['[0.1,0.2]', 5]);
    });
  });

  describe('countDocuments', () => {
    it('delega el conteo en el EntityManager', async () => {
      jest.spyOn(em, 'count').mockResolvedValue(7);

      await expect(repository.countDocuments()).resolves.toBe(7);
      expect(em.count).toHaveBeenCalledWith(Document);
    });
  });
});
