/**
 * Tests for ComunicaQuintEngine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataFactory } from 'n3';
import { SqliteQuintStore } from '../../src/storage/quint/SqliteQuintStore';
import { ComunicaQuintEngine } from '../../src/storage/sparql/ComunicaQuintEngine';
import type { Quint } from '../../src/storage/quint/types';

const { namedNode, literal, defaultGraph } = DataFactory;

describe('ComunicaQuintEngine', () => {
  let store: SqliteQuintStore;
  let engine: ComunicaQuintEngine;

  beforeEach(async () => {
    store = new SqliteQuintStore({ path: ':memory:' });
    await store.open();
    engine = new ComunicaQuintEngine(store);

    // Add test data in the default graph (empty string for N3)
    await store.addAll([
      {
        graph: defaultGraph(),
        subject: namedNode('http://example.org/alice'),
        predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
        object: literal('Alice'),
      },
      {
        graph: defaultGraph(),
        subject: namedNode('http://example.org/alice'),
        predicate: namedNode('http://xmlns.com/foaf/0.1/age'),
        object: literal('30', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
      },
      {
        graph: defaultGraph(),
        subject: namedNode('http://example.org/alice'),
        predicate: namedNode('http://xmlns.com/foaf/0.1/knows'),
        object: namedNode('http://example.org/bob'),
      },
      {
        graph: defaultGraph(),
        subject: namedNode('http://example.org/bob'),
        predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
        object: literal('Bob'),
      },
      {
        graph: defaultGraph(),
        subject: namedNode('http://example.org/bob'),
        predicate: namedNode('http://xmlns.com/foaf/0.1/age'),
        object: literal('25', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
      },
    ]);
  });

  afterEach(async () => {
    await engine.close();
  });

  describe('SELECT queries', () => {
    it('should execute simple SELECT query', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?name WHERE {
          ?person foaf:name ?name .
        }
      `;

      const result = await engine.queryBindings(query);

      expect(result.variables).toContain('name');
      expect(result.bindings).toHaveLength(2);

      const names = result.bindings.map(b => b.get('name')?.value);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
    });

    it('should execute SELECT with multiple variables', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?person ?name WHERE {
          ?person foaf:name ?name .
        }
      `;

      const result = await engine.queryBindings(query);

      expect(result.variables).toContain('person');
      expect(result.variables).toContain('name');
      expect(result.bindings).toHaveLength(2);
    });

    it('should execute SELECT with FILTER', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        SELECT ?person ?age WHERE {
          ?person foaf:age ?age .
          FILTER(?age > 27)
        }
      `;

      const result = await engine.queryBindings(query);

      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('age')?.value).toBe('30');
    });

    it('should execute SELECT with JOIN', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?name ?friendName WHERE {
          ?person foaf:name ?name .
          ?person foaf:knows ?friend .
          ?friend foaf:name ?friendName .
        }
      `;

      const result = await engine.queryBindings(query);

      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('name')?.value).toBe('Alice');
      expect(result.bindings[0].get('friendName')?.value).toBe('Bob');
    });
  });

  describe('ASK queries', () => {
    it('should return true for existing data', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        ASK {
          ?person foaf:name "Alice" .
        }
      `;

      const result = await engine.queryBoolean(query);
      expect(result).toBe(true);
    });

    it('should return false for non-existing data', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        ASK {
          ?person foaf:name "Charlie" .
        }
      `;

      const result = await engine.queryBoolean(query);
      expect(result).toBe(false);
    });
  });

  describe('CONSTRUCT queries', () => {
    it('should construct new triples', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        CONSTRUCT {
          ?s ex:hasName ?name .
        } WHERE {
          ?s foaf:name ?name .
        }
      `;

      const result = await engine.queryQuads(query);

      expect(result).toHaveLength(2);
      result.forEach(quad => {
        expect(quad.predicate.value).toBe('http://example.org/hasName');
      });
    });
  });

  describe('graph prefix filtering', () => {
    beforeEach(async () => {
      // Add more data with hierarchical graphs
      await store.addAll([
        {
          graph: namedNode('http://example.org/users/alice/profile'),
          subject: namedNode('http://example.org/alice'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/nick'),
          object: literal('Ali'),
        },
        {
          graph: namedNode('http://example.org/users/bob/profile'),
          subject: namedNode('http://example.org/bob'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/nick'),
          object: literal('Bobby'),
        },
      ]);
    });

    it('should filter by graph prefix in queries', async () => {
      // Using GRAPH clause to query named graphs
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?nick WHERE {
          GRAPH ?g {
            ?person foaf:nick ?nick .
          }
        }
      `;

      const result = await engine.queryBindings(query, {
        graphPrefix: 'http://example.org/users/alice/',
      });

      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('nick')?.value).toBe('Ali');
    });

    it('should use default graph prefix', async () => {
      const filteredEngine = new ComunicaQuintEngine(store, {
        defaultGraphPrefix: 'http://example.org/users/bob/',
      });

      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?nick WHERE {
          GRAPH ?g {
            ?person foaf:nick ?nick .
          }
        }
      `;

      const result = await filteredEngine.queryBindings(query);

      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('nick')?.value).toBe('Bobby');
    });
  });

  describe('query type detection', () => {
    it('should detect SELECT query type', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?name WHERE { ?s foaf:name ?name }
      `;

      const result = await engine.query(query);
      expect(result).toHaveProperty('bindings');
      expect(result).toHaveProperty('variables');
    });

    it('should detect ASK query type', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        ASK { ?s foaf:name "Alice" }
      `;

      const result = await engine.query(query);
      expect(typeof result).toBe('boolean');
    });

    it('should detect CONSTRUCT query type', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        CONSTRUCT { ?s foaf:label ?name } WHERE { ?s foaf:name ?name }
      `;

      const result = await engine.query(query);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
