/**
 * SQLite-backed QuintStore using Drizzle ORM
 * 
 * Provides efficient RDF quad storage with:
 * - 6 composite indexes for pattern matching (aligned with quadstore)
 * - Graph prefix queries for subgraph isolation
 * - Sortable numeric literal encoding
 * 
 * Note: Vector search is not yet implemented for SQLite.
 * Vector field is preserved in the Quint interface for future use.
 */

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, ne, and, gte, lt, gt, lte, like, inArray, notInArray, isNull, isNotNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Term } from '@rdfjs/types';

import { quints, type QuintRow, type QuintInsert } from './schema';
import type { Quint, QuintPattern, QuintStore, QuintStoreOptions, TermMatch, TermOperators } from './types';
import { isTerm } from './types';
import {
  serializeTerm,
  serializeObject,
  deserializeTerm,
  deserializeObject,
} from './serialization';

export class SqliteQuintStore implements QuintStore {
  private sqlite: Database.Database;
  private db: BetterSQLite3Database;
  private initialized: boolean = false;

  constructor(private options: QuintStoreOptions = {}) {
    const path = options.path ?? ':memory:';
    this.sqlite = new Database(path);
    this.db = drizzle(this.sqlite);
  }

  /**
   * Initialize the database schema
   */
  async open(): Promise<void> {
    if (this.initialized) return;

    // Enable WAL mode for better concurrent access
    if (this.options.walMode !== false) {
      this.sqlite.pragma('journal_mode = WAL');
    }

    // Create table and indexes using raw SQL (Drizzle doesn't auto-create)
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS quints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        graph TEXT NOT NULL,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        UNIQUE (graph, subject, predicate, object)
      );
      
      CREATE INDEX IF NOT EXISTS idx_spog ON quints (subject, predicate, object, graph);
      CREATE INDEX IF NOT EXISTS idx_ogsp ON quints (object, graph, subject, predicate);
      CREATE INDEX IF NOT EXISTS idx_gspo ON quints (graph, subject, predicate, object);
      CREATE INDEX IF NOT EXISTS idx_sopg ON quints (subject, object, predicate, graph);
      CREATE INDEX IF NOT EXISTS idx_pogs ON quints (predicate, object, graph, subject);
      CREATE INDEX IF NOT EXISTS idx_gpos ON quints (graph, predicate, object, subject);
    `);

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
   * Serialize a Quint for storage (vector field is ignored in SQLite)
   */
  private serializeQuintForInsert(quint: Quint): { graph: string; subject: string; predicate: string; object: string } {
    return {
      graph: serializeTerm(quint.graph),
      subject: serializeTerm(quint.subject),
      predicate: serializeTerm(quint.predicate),
      object: serializeObject(quint.object),
    };
  }

  /**
   * Deserialize a row back to a Quint
   */
  private deserializeRow(row: { id?: number; graph: string; subject: string; predicate: string; object: string }): Quint {
    return {
      graph: deserializeTerm(row.graph),
      subject: deserializeTerm(row.subject),
      predicate: deserializeTerm(row.predicate),
      object: deserializeObject(row.object),
    };
  }

  /**
   * Add a quint to the store
   */
  async add(quint: Quint): Promise<void> {
    await this.ensureOpen();
    const serialized = this.serializeQuintForInsert(quint);
    
    this.sqlite.prepare(`
      INSERT INTO quints (graph, subject, predicate, object)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (graph, subject, predicate, object) DO NOTHING
    `).run(serialized.graph, serialized.subject, serialized.predicate, serialized.object);
  }

  /**
   * Add multiple quints in a batch
   */
  async addAll(quintList: Quint[]): Promise<void> {
    if (quintList.length === 0) return;
    await this.ensureOpen();

    const insertQuint = this.sqlite.prepare(`
      INSERT INTO quints (graph, subject, predicate, object)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (graph, subject, predicate, object) DO NOTHING
    `);

    this.sqlite.transaction(() => {
      for (const quint of quintList) {
        const serialized = this.serializeQuintForInsert(quint);
        insertQuint.run(
          serialized.graph, 
          serialized.subject, 
          serialized.predicate, 
          serialized.object
        );
      }
    })();
  }

  /**
   * Remove a quint from the store
   */
  async remove(quint: Quint): Promise<void> {
    await this.ensureOpen();
    const serialized = this.serializeQuintForInsert(quint);
    
    this.sqlite.prepare(`
      DELETE FROM quints 
      WHERE graph = ? AND subject = ? AND predicate = ? AND object = ?
    `).run(serialized.graph, serialized.subject, serialized.predicate, serialized.object);
  }

  /**
   * Remove all quints matching a pattern
   */
  async removeMatching(pattern: QuintPattern): Promise<number> {
    await this.ensureOpen();
    const conditions = this.buildConditions(pattern);
    
    if (conditions.length === 0) {
      const result = this.sqlite.prepare('DELETE FROM quints').run();
      return result.changes;
    }
    
    const result = await this.db
      .delete(quints)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions));
    
    return (result as any).changes ?? 0;
  }

  /**
   * Build WHERE conditions from a pattern
   */
  private buildConditions(pattern: QuintPattern): SQL[] {
    const conditions: SQL[] = [];

    const addTermConditions = (
      column: typeof quints.graph | typeof quints.subject | typeof quints.predicate | typeof quints.object,
      match: TermMatch | undefined,
      isObject: boolean = false
    ) => {
      if (!match) return;
      
      if (isTerm(match)) {
        // Exact match
        conditions.push(eq(column, isObject ? serializeObject(match) : serializeTerm(match)));
      } else {
        // Operator match
        const ops = match as TermOperators;
        
        if (ops.$eq !== undefined) {
          conditions.push(eq(column, ops.$eq));
        }
        if (ops.$ne !== undefined) {
          conditions.push(ne(column, ops.$ne));
        }
        if (ops.$gt !== undefined) {
          conditions.push(gt(column, ops.$gt));
        }
        if (ops.$gte !== undefined) {
          conditions.push(gte(column, ops.$gte));
        }
        if (ops.$lt !== undefined) {
          conditions.push(lt(column, ops.$lt));
        }
        if (ops.$lte !== undefined) {
          conditions.push(lte(column, ops.$lte));
        }
        if (ops.$in !== undefined && ops.$in.length > 0) {
          conditions.push(inArray(column, ops.$in));
        }
        if (ops.$notIn !== undefined && ops.$notIn.length > 0) {
          conditions.push(notInArray(column, ops.$notIn));
        }
        if (ops.$startsWith !== undefined) {
          conditions.push(gte(column, ops.$startsWith));
          conditions.push(lt(column, ops.$startsWith + '\uffff'));
        }
        if (ops.$endsWith !== undefined) {
          conditions.push(like(column, `%${ops.$endsWith}`));
        }
        if (ops.$contains !== undefined) {
          conditions.push(like(column, `%${ops.$contains}%`));
        }
        if (ops.$regex !== undefined) {
          // SQLite REGEXP requires extension, use GLOB as approximation
          conditions.push(sql`${column} GLOB ${ops.$regex.replace(/\.\*/g, '*').replace(/\./g, '?')}`);
        }
        if (ops.$isNull === true) {
          conditions.push(isNull(column));
        }
        if (ops.$isNull === false) {
          conditions.push(isNotNull(column));
        }
      }
    };

    addTermConditions(quints.graph, pattern.graph);
    addTermConditions(quints.subject, pattern.subject);
    addTermConditions(quints.predicate, pattern.predicate);
    addTermConditions(quints.object, pattern.object, true);

    return conditions;
  }

  /**
   * Get all quints matching a pattern
   */
  async match(pattern: QuintPattern): Promise<Quint[]> {
    await this.ensureOpen();
    const conditions = this.buildConditions(pattern);
    
    if (conditions.length > 0) {
      const drizzleQuery = this.db.select().from(quints)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions));
      const rows = drizzleQuery.all();
      return rows.map((row: any) => this.deserializeRow(row));
    }
    
    // No conditions - get all
    const rows = this.sqlite.prepare('SELECT id, graph, subject, predicate, object FROM quints').all() as any[];
    return rows.map(row => this.deserializeRow(row));
  }

  /**
   * Count quints matching a pattern
   */
  async count(pattern?: QuintPattern): Promise<number> {
    await this.ensureOpen();
    
    if (!pattern) {
      const result = this.sqlite.prepare('SELECT COUNT(*) as count FROM quints').get() as { count: number };
      return result.count;
    }
    
    const conditions = this.buildConditions(pattern);
    
    let query = this.db
      .select({ count: sql<number>`count(*)` })
      .from(quints);
    
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as any;
    }
    
    const result = await query;
    return result[0]?.count ?? 0;
  }

  /**
   * Clear all quints
   */
  async clear(): Promise<void> {
    await this.ensureOpen();
    this.sqlite.prepare('DELETE FROM quints').run();
  }

  /**
   * Close the store and release resources
   */
  async close(): Promise<void> {
    this.sqlite.close();
    this.initialized = false;
  }

  /**
   * Get raw database for advanced queries
   */
  getDatabase(): BetterSQLite3Database {
    return this.db;
  }

  /**
   * Get raw SQLite connection
   */
  getSqlite(): Database.Database {
    return this.sqlite;
  }
}
