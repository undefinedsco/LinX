/**
 * ComunicaQuintEngine - SPARQL engine backed by QuintStore
 * 
 * Provides SPARQL 1.1 query support over QuintStore data with:
 * - Graph prefix filtering for subgraph isolation
 * - Standard SPARQL SELECT, CONSTRUCT, ASK, DESCRIBE
 * - Integration with Comunica's query processing pipeline
 */

import { QueryEngine } from '@comunica/query-sparql';
import { DataFactory, Store as N3Store } from 'n3';
import type { Quad, Term, Bindings } from '@rdfjs/types';
import type { BindingsStream, QueryStringContext } from '@comunica/types';
import type { QuintStore } from '../quint/types.js';
import { quintToQuad } from '../quint/types.js';

export interface QueryContext {
  /** Filter results to graphs with this prefix */
  graphPrefix?: string;
  /** Base IRI for relative IRIs in the query */
  baseIRI?: string;
  /** Additional Comunica context options */
  [key: string]: unknown;
}

export interface QueryBindingsResult {
  bindings: Map<string, Term>[];
  variables: string[];
}

export class ComunicaQuintEngine {
  private engine: QueryEngine;
  private store: QuintStore;
  private defaultGraphPrefix?: string;
  private currentGraphPrefix?: string;

  constructor(store: QuintStore, options?: { defaultGraphPrefix?: string }) {
    this.store = store;
    this.engine = new QueryEngine();
    this.defaultGraphPrefix = options?.defaultGraphPrefix;
  }

  /**
   * Set the default graph prefix for all queries
   */
  setDefaultGraphPrefix(prefix: string | undefined): void {
    this.defaultGraphPrefix = prefix;
  }

  /**
   * Execute a SPARQL SELECT query and return bindings
   */
  async queryBindings(query: string, context?: QueryContext): Promise<QueryBindingsResult> {
    const graphPrefix = context?.graphPrefix ?? this.defaultGraphPrefix;
    
    // Load quints into N3 store (filtered by graph prefix if specified)
    const n3Store = await this.loadQuintsToN3Store(graphPrefix);
    
    // Execute query against N3 store
    const bindingsStream = await this.engine.queryBindings(query, {
      sources: [n3Store],
      baseIRI: context?.baseIRI,
    });

    // Collect results
    const bindings: Map<string, Term>[] = [];
    const variables: string[] = [];

    return new Promise((resolve, reject) => {
      let variablesSet = false;
      
      bindingsStream.on('data', (binding: Bindings) => {
        if (!variablesSet) {
          for (const key of binding.keys()) {
            variables.push(key.value);
          }
          variablesSet = true;
        }
        
        const row = new Map<string, Term>();
        for (const key of binding.keys()) {
          const value = binding.get(key);
          if (value) {
            row.set(key.value, value);
          }
        }
        bindings.push(row);
      });

      bindingsStream.on('end', () => {
        resolve({ bindings, variables });
      });

      bindingsStream.on('error', reject);
    });
  }

  /**
   * Execute a SPARQL CONSTRUCT query and return quads
   */
  async queryQuads(query: string, context?: QueryContext): Promise<Quad[]> {
    const graphPrefix = context?.graphPrefix ?? this.defaultGraphPrefix;
    const n3Store = await this.loadQuintsToN3Store(graphPrefix);
    
    const quadsStream = await this.engine.queryQuads(query, {
      sources: [n3Store],
      baseIRI: context?.baseIRI,
    });

    const quads: Quad[] = [];

    return new Promise((resolve, reject) => {
      quadsStream.on('data', (quad: Quad) => {
        quads.push(quad);
      });

      quadsStream.on('end', () => {
        resolve(quads);
      });

      quadsStream.on('error', reject);
    });
  }

  /**
   * Execute a SPARQL ASK query
   */
  async queryBoolean(query: string, context?: QueryContext): Promise<boolean> {
    const graphPrefix = context?.graphPrefix ?? this.defaultGraphPrefix;
    const n3Store = await this.loadQuintsToN3Store(graphPrefix);
    
    return this.engine.queryBoolean(query, {
      sources: [n3Store],
      baseIRI: context?.baseIRI,
    });
  }

  /**
   * Execute any SPARQL query and return the appropriate result type
   */
  async query(query: string, context?: QueryContext): Promise<QueryBindingsResult | Quad[] | boolean> {
    const queryType = this.detectQueryType(query);
    
    switch (queryType) {
      case 'SELECT':
        return this.queryBindings(query, context);
      case 'CONSTRUCT':
      case 'DESCRIBE':
        return this.queryQuads(query, context);
      case 'ASK':
        return this.queryBoolean(query, context);
      default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }
  }

  /**
   * Execute a SPARQL UPDATE query (INSERT/DELETE)
   */
  async update(query: string, context?: QueryContext): Promise<void> {
    // Parse the update to get the quads to insert/delete
    // For now, throw an error as updates require special handling
    throw new Error('SPARQL UPDATE is not yet supported. Use QuintStore.add/remove directly.');
  }

  /**
   * Load quints from QuintStore into an N3 store for querying
   */
  private async loadQuintsToN3Store(graphPrefix?: string): Promise<N3Store> {
    const n3Store = new N3Store();
    
    const pattern = graphPrefix 
      ? { graph: { $startsWith: graphPrefix } }
      : {};
    const quints = await this.store.match(pattern);
    
    for (const quint of quints) {
      const quad = quintToQuad(quint, DataFactory);
      n3Store.addQuad(quad);
    }
    
    return n3Store;
  }

  /**
   * Detect the type of SPARQL query
   */
  private detectQueryType(query: string): 'SELECT' | 'CONSTRUCT' | 'DESCRIBE' | 'ASK' | 'UPDATE' {
    const trimmed = query.trim().toUpperCase();
    
    // Skip prefixes and base
    const lines = trimmed.split('\n');
    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith('PREFIX') || l.startsWith('BASE') || l === '') {
        continue;
      }
      if (l.startsWith('SELECT')) return 'SELECT';
      if (l.startsWith('CONSTRUCT')) return 'CONSTRUCT';
      if (l.startsWith('DESCRIBE')) return 'DESCRIBE';
      if (l.startsWith('ASK')) return 'ASK';
      if (l.startsWith('INSERT') || l.startsWith('DELETE') || l.startsWith('LOAD') || l.startsWith('CLEAR')) {
        return 'UPDATE';
      }
      break;
    }
    
    return 'SELECT'; // Default
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
