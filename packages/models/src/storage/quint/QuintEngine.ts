/**
 * QuintEngine - Unified SPARQL engine with configurable backend
 * 
 * Usage:
 *   const engine = await createQuintEngine({ endpoint: 'sqlite:/path/to/db.sqlite' });
 *   const engine = await createQuintEngine({ endpoint: 'postgresql://user:pass@host:5432/db' });
 */

import { ComunicaQuintEngine, QueryContext, QueryBindingsResult } from '../sparql/ComunicaQuintEngine.js';
import { SqliteQuintStore } from './SqliteQuintStore.js';
import { PgQuintStore } from './PgQuintStore.js';
import type { QuintStore } from './types.js';
import type { Quad } from '@rdfjs/types';

export interface QuintEngineArgs {
  /** 
   * Database endpoint with scheme prefix:
   * - sqlite:/path/to/db.sqlite or sqlite::memory:
   * - postgresql://user:pass@host:5432/db
   */
  endpoint: string;
  /** Enable debug logging */
  debug?: boolean;
}

export class QuintEngine {
  private store: QuintStore;
  private comunicaEngine: ComunicaQuintEngine;
  private debug: boolean;

  private constructor(store: QuintStore, debug: boolean = false) {
    this.store = store;
    this.comunicaEngine = new ComunicaQuintEngine(store as SqliteQuintStore);
    this.debug = debug;
  }

  /**
   * Create a QuintEngine from endpoint configuration
   */
  static async create(args: QuintEngineArgs): Promise<QuintEngine> {
    const { endpoint, debug = false } = args;
    
    const store = QuintEngine.createStore(endpoint);
    
    // Open the store
    await (store as any).open?.();
    
    return new QuintEngine(store, debug);
  }

  /**
   * Parse endpoint and create appropriate store
   */
  private static createStore(endpoint: string): QuintStore {
    // Parse scheme
    const colonIndex = endpoint.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid endpoint format: ${endpoint}. Expected scheme:path (e.g., sqlite:/path or postgresql://...)`);
    }
    
    const scheme = endpoint.substring(0, colonIndex).toLowerCase();
    const rest = endpoint.substring(colonIndex + 1);
    
    switch (scheme) {
      case 'sqlite': {
        // sqlite:/path/to/db.sqlite or sqlite::memory:
        const path = rest.startsWith('/') ? rest : rest.replace(/^\/\//, '');
        return new SqliteQuintStore({ 
          path: path === ':memory:' ? ':memory:' : path,
          walMode: true 
        });
      }
      
      case 'postgresql':
      case 'postgres': {
        // postgresql://user:pass@host:5432/db
        return new PgQuintStore({ 
          connectionString: endpoint 
        });
      }
      
      default:
        throw new Error(`Unsupported database scheme: ${scheme}. Supported: sqlite, postgresql`);
    }
  }

  /**
   * Execute a SPARQL SELECT query
   */
  async queryBindings(query: string, context?: QueryContext): Promise<QueryBindingsResult> {
    if (this.debug) {
      console.log('[QuintEngine] queryBindings:', query);
    }
    return this.comunicaEngine.queryBindings(query, context);
  }

  /**
   * Execute a SPARQL CONSTRUCT query
   */
  async queryQuads(query: string, context?: QueryContext): Promise<Quad[]> {
    if (this.debug) {
      console.log('[QuintEngine] queryQuads:', query);
    }
    return this.comunicaEngine.queryQuads(query, context);
  }

  /**
   * Execute a SPARQL ASK query
   */
  async queryBoolean(query: string, context?: QueryContext): Promise<boolean> {
    if (this.debug) {
      console.log('[QuintEngine] queryBoolean:', query);
    }
    return this.comunicaEngine.queryBoolean(query, context);
  }

  /**
   * Execute any SPARQL query
   */
  async query(query: string, context?: QueryContext): Promise<QueryBindingsResult | Quad[] | boolean> {
    if (this.debug) {
      console.log('[QuintEngine] query:', query);
    }
    return this.comunicaEngine.query(query, context);
  }

  /**
   * Get the underlying QuintStore
   */
  getStore(): QuintStore {
    return this.store;
  }

  /**
   * Close the engine and underlying store
   */
  async close(): Promise<void> {
    await this.store.close();
  }
}

/**
 * Convenience function to create a QuintEngine
 */
export async function createQuintEngine(args: QuintEngineArgs): Promise<QuintEngine> {
  return QuintEngine.create(args);
}
