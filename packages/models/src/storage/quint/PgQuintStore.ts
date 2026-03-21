/**
 * PostgreSQL-backed QuintStore with pgvector support
 * 
 * Provides efficient RDF quad storage with:
 * - 6 composite indexes for pattern matching (aligned with quadstore)
 * - Graph prefix queries for subgraph isolation
 * - pgvector for vector similarity search (fixed 4096 dimensions)
 */

import { Pool } from 'pg';

import type { Quint, QuintPattern, QuintStore, TermMatch, TermOperators } from './types.js';
import { isTerm } from './types.js';
import {
  serializeTerm,
  serializeObject,
  deserializeTerm,
  deserializeObject,
} from './serialization.js';

/** Fixed vector dimension for pgvector */
export const VECTOR_DIMENSION = 4096;

export interface PgQuintStoreOptions {
  /** PostgreSQL connection string */
  connectionString: string;
}

export class PgQuintStore implements QuintStore {
  private pool: Pool | null = null;
  private connectionString: string;
  private initialized: boolean = false;

  constructor(options: PgQuintStoreOptions) {
    this.connectionString = options.connectionString;
  }

  /**
   * Initialize the database connection and schema
   */
  async open(): Promise<void> {
    if (this.initialized) return;

    this.pool = new Pool({
      connectionString: this.connectionString,
    });

    const client = await this.pool.connect();
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Create table with pgvector column
      await client.query(`
        CREATE TABLE IF NOT EXISTS quints (
          graph TEXT NOT NULL,
          subject TEXT NOT NULL,
          predicate TEXT NOT NULL,
          object TEXT NOT NULL,
          vector vector(${VECTOR_DIMENSION}),
          PRIMARY KEY (graph, subject, predicate, object)
        )
      `);
      
      // Create indexes for pattern matching
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_spog ON quints (subject, predicate, object, graph);
        CREATE INDEX IF NOT EXISTS idx_ogsp ON quints (object, graph, subject, predicate);
        CREATE INDEX IF NOT EXISTS idx_gspo ON quints (graph, subject, predicate, object);
        CREATE INDEX IF NOT EXISTS idx_sopg ON quints (subject, object, predicate, graph);
        CREATE INDEX IF NOT EXISTS idx_pogs ON quints (predicate, object, graph, subject);
        CREATE INDEX IF NOT EXISTS idx_gpos ON quints (graph, predicate, object, subject)
      `);

      // Create vector index for similarity search (IVFFlat)
      // Note: requires enough data to build the index effectively
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_vector ON quints 
        USING ivfflat (vector vector_cosine_ops)
        WITH (lists = 100)
      `).catch(() => {
        // Index creation may fail if not enough data, ignore
      });
    } finally {
      client.release();
    }

    this.initialized = true;
  }

  /**
   * Ensure database is initialized
   */
  private async ensureOpen(): Promise<void> {
    if (!this.initialized) {
      await this.open();
    }
  }

  /**
   * Serialize vector to pgvector format: '[1,2,3,...]'
   */
  private serializeVector(vector: number[] | undefined): string | null {
    if (!vector || vector.length === 0) {
      return null;
    }
    // Pad to VECTOR_DIMENSION if needed
    const padded = vector.length < VECTOR_DIMENSION
      ? [...vector, ...new Array(VECTOR_DIMENSION - vector.length).fill(0)]
      : vector.slice(0, VECTOR_DIMENSION);
    return `[${padded.join(',')}]`;
  }

  /**
   * Deserialize pgvector format to number array
   */
  private deserializeVector(value: string | null): number[] | undefined {
    if (!value) return undefined;
    // pgvector returns '[1,2,3,...]' format
    const str = value.replace(/^\[|\]$/g, '');
    if (!str) return undefined;
    return str.split(',').map(Number);
  }

  /**
   * Deserialize a row back to a Quint
   */
  private deserializeRow(row: { graph: string; subject: string; predicate: string; object: string; vector: string | null }): Quint {
    return {
      graph: deserializeTerm(row.graph),
      subject: deserializeTerm(row.subject),
      predicate: deserializeTerm(row.predicate),
      object: deserializeObject(row.object),
      vector: this.deserializeVector(row.vector),
    };
  }

  /**
   * Add a quint to the store
   */
  async add(quint: Quint): Promise<void> {
    await this.ensureOpen();
    
    const graph = serializeTerm(quint.graph);
    const subject = serializeTerm(quint.subject);
    const predicate = serializeTerm(quint.predicate);
    const object = serializeObject(quint.object);
    const vector = this.serializeVector(quint.vector);
    
    await this.pool!.query(
      `INSERT INTO quints (graph, subject, predicate, object, vector)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (graph, subject, predicate, object)
       DO UPDATE SET vector = EXCLUDED.vector`,
      [graph, subject, predicate, object, vector]
    );
  }

  /**
   * Add multiple quints in a batch
   */
  async addAll(quintList: Quint[]): Promise<void> {
    if (quintList.length === 0) return;
    await this.ensureOpen();

    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      
      for (const quint of quintList) {
        const graph = serializeTerm(quint.graph);
        const subject = serializeTerm(quint.subject);
        const predicate = serializeTerm(quint.predicate);
        const object = serializeObject(quint.object);
        const vector = this.serializeVector(quint.vector);
        
        await client.query(
          `INSERT INTO quints (graph, subject, predicate, object, vector)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (graph, subject, predicate, object)
           DO UPDATE SET vector = EXCLUDED.vector`,
          [graph, subject, predicate, object, vector]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove a quint from the store
   */
  async remove(quint: Quint): Promise<void> {
    await this.ensureOpen();
    
    await this.pool!.query(
      `DELETE FROM quints WHERE graph = $1 AND subject = $2 AND predicate = $3 AND object = $4`,
      [
        serializeTerm(quint.graph),
        serializeTerm(quint.subject),
        serializeTerm(quint.predicate),
        serializeObject(quint.object)
      ]
    );
  }

  /**
   * Remove all quints matching a pattern
   */
  async removeMatching(pattern: QuintPattern): Promise<number> {
    await this.ensureOpen();
    const { whereClause, params } = this.buildWhereClause(pattern);
    
    const result = await this.pool!.query(
      `DELETE FROM quints${whereClause}`,
      params
    );
    
    return result.rowCount ?? 0;
  }

  /**
   * Build WHERE clause from a pattern
   */
  private buildWhereClause(pattern: QuintPattern): { whereClause: string; params: (string | string[])[] } {
    const conditions: string[] = [];
    const params: (string | string[])[] = [];
    let paramIndex = 1;

    const addTermConditions = (column: string, match: TermMatch | undefined, isObject: boolean = false) => {
      if (!match) return;
      
      if (isTerm(match)) {
        // Exact match
        conditions.push(`${column} = $${paramIndex++}`);
        params.push(isObject ? serializeObject(match) : serializeTerm(match));
      } else {
        // Operator match
        const ops = match as TermOperators;
        
        if (ops.$eq !== undefined) {
          conditions.push(`${column} = $${paramIndex++}`);
          params.push(ops.$eq);
        }
        if (ops.$ne !== undefined) {
          conditions.push(`${column} != $${paramIndex++}`);
          params.push(ops.$ne);
        }
        if (ops.$gt !== undefined) {
          conditions.push(`${column} > $${paramIndex++}`);
          params.push(ops.$gt);
        }
        if (ops.$gte !== undefined) {
          conditions.push(`${column} >= $${paramIndex++}`);
          params.push(ops.$gte);
        }
        if (ops.$lt !== undefined) {
          conditions.push(`${column} < $${paramIndex++}`);
          params.push(ops.$lt);
        }
        if (ops.$lte !== undefined) {
          conditions.push(`${column} <= $${paramIndex++}`);
          params.push(ops.$lte);
        }
        if (ops.$in !== undefined && ops.$in.length > 0) {
          const placeholders = ops.$in.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`${column} IN (${placeholders})`);
          params.push(...ops.$in);
        }
        if (ops.$notIn !== undefined && ops.$notIn.length > 0) {
          const placeholders = ops.$notIn.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`${column} NOT IN (${placeholders})`);
          params.push(...ops.$notIn);
        }
        if (ops.$startsWith !== undefined) {
          conditions.push(`${column} >= $${paramIndex++} AND ${column} < $${paramIndex++}`);
          params.push(ops.$startsWith);
          params.push(ops.$startsWith + '\uffff');
        }
        if (ops.$endsWith !== undefined) {
          conditions.push(`${column} LIKE $${paramIndex++}`);
          params.push(`%${ops.$endsWith}`);
        }
        if (ops.$contains !== undefined) {
          conditions.push(`${column} LIKE $${paramIndex++}`);
          params.push(`%${ops.$contains}%`);
        }
        if (ops.$regex !== undefined) {
          conditions.push(`${column} ~ $${paramIndex++}`);
          params.push(ops.$regex);
        }
        if (ops.$isNull === true) {
          conditions.push(`${column} IS NULL`);
        }
        if (ops.$isNull === false) {
          conditions.push(`${column} IS NOT NULL`);
        }
      }
    };

    addTermConditions('graph', pattern.graph);
    addTermConditions('subject', pattern.subject);
    addTermConditions('predicate', pattern.predicate);
    addTermConditions('object', pattern.object, true);

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * Get all quints matching a pattern
   */
  async match(pattern: QuintPattern): Promise<Quint[]> {
    await this.ensureOpen();
    const { whereClause, params } = this.buildWhereClause(pattern);
    
    const result = await this.pool!.query<{ graph: string; subject: string; predicate: string; object: string; vector: string | null }>(
      `SELECT graph, subject, predicate, object, vector FROM quints${whereClause}`,
      params
    );
    
    return result.rows.map(row => this.deserializeRow(row));
  }

  /**
   * Search quints by vector similarity
   */
  async searchByVector(
    queryVector: number[],
    options?: {
      pattern?: QuintPattern;
      limit?: number;
      threshold?: number;
    }
  ): Promise<Array<Quint & { similarity: number }>> {
    await this.ensureOpen();
    
    const limit = options?.limit ?? 10;
    const vectorStr = this.serializeVector(queryVector);
    
    // Build WHERE clause from pattern
    const { whereClause: patternWhere, params: patternParams } = this.buildWhereClause(options?.pattern ?? {});
    
    // Combine with vector conditions
    const conditions = ['vector IS NOT NULL'];
    const params: (string | number)[] = [vectorStr!];
    let paramIndex = 2;
    
    // Add pattern conditions
    if (patternParams.length > 0) {
      // Rewrite param indices
      const rewrittenWhere = patternWhere.replace(/\$(\d+)/g, () => `$${paramIndex++}`);
      conditions.push(rewrittenWhere.replace(/^ WHERE /, ''));
      params.push(...patternParams.flat());
    }
    
    if (options?.threshold !== undefined) {
      conditions.push(`1 - (vector <=> $1) >= $${paramIndex++}`);
      params.push(options.threshold);
    }
    
    params.push(limit);
    const limitParam = `$${paramIndex}`;
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    
    const result = await this.pool!.query<{ 
      graph: string; 
      subject: string; 
      predicate: string; 
      object: string; 
      vector: string | null;
      similarity: number;
    }>(
      `SELECT graph, subject, predicate, object, vector, 
              1 - (vector <=> $1) as similarity
       FROM quints
       ${whereClause}
       ORDER BY vector <=> $1
       LIMIT ${limitParam}`,
      params
    );
    
    return result.rows.map(row => ({
      ...this.deserializeRow(row),
      similarity: row.similarity,
    }));
  }

  /**
   * Count quints matching a pattern
   */
  async count(pattern?: QuintPattern): Promise<number> {
    await this.ensureOpen();
    
    if (!pattern) {
      const result = await this.pool!.query('SELECT COUNT(*) as count FROM quints');
      return parseInt(result.rows[0]?.count ?? '0', 10);
    }
    
    const { whereClause, params } = this.buildWhereClause(pattern);
    const result = await this.pool!.query(
      `SELECT COUNT(*) as count FROM quints${whereClause}`,
      params
    );
    
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Clear all quints
   */
  async clear(): Promise<void> {
    await this.ensureOpen();
    await this.pool!.query('DELETE FROM quints');
  }

  /**
   * Close the store and release resources
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.initialized = false;
  }

  /**
   * Get the connection pool for advanced queries
   */
  getPool(): Pool | null {
    return this.pool;
  }
}
