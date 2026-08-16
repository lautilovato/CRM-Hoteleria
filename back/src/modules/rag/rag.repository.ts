import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Document } from '../../infrastructure/database/entities/Document.entity';
@Injectable()
export class RagRepository {

  constructor(private readonly em: EntityManager) {}
  /**
   * Guarda un fragmento de documento en la base de datos.
   */
  async saveDocumentChunk(content: string, embedding: number[]): Promise<Document> {
    const document = this.em.create(Document, {
      content,
      embedding,
    });
    
    this.em.persist(document); 
    await this.em.flush();
    return document;
  }

  async findSimilar(embeddingVector: number[], limit: number = 5): Promise<Document[]> {
    const connection = this.em.getConnection();
    
    const vectorString = `[${embeddingVector.join(',')}]`;

    const query = `
      SELECT id, content, created_at, updated_at
      FROM document
      ORDER BY embedding <-> ?::vector
      LIMIT ?
    `;

    const results = await connection.execute(query, [vectorString, limit]);

    return results.map(row => this.em.map(Document, row));
  }
}