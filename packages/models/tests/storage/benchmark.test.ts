/**
 * QuintStore Benchmark Tests
 * 
 * Measures performance of QuintStore operations and compares with N3Store baseline
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataFactory, Store as N3Store } from 'n3';
import { SqliteQuintStore } from '../../src/storage/quint/SqliteQuintStore';
import { ComunicaQuintEngine } from '../../src/storage/sparql/ComunicaQuintEngine';
import type { Quint } from '../../src/storage/quint/types';

const { namedNode, literal, defaultGraph } = DataFactory;

// Helper to measure execution time
async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

// Generate test data
function generateQuints(count: number, graphPrefix: string = 'http://example.org/graph'): Quint[] {
  const quints: Quint[] = [];
  for (let i = 0; i < count; i++) {
    quints.push({
      graph: namedNode(`${graphPrefix}/${Math.floor(i / 100)}`),
      subject: namedNode(`http://example.org/subject${i}`),
      predicate: namedNode(`http://example.org/predicate${i % 10}`),
      object: literal(`value${i}`, namedNode('http://www.w3.org/2001/XMLSchema#string')),
    });
  }
  return quints;
}

describe('QuintStore Benchmark', () => {
  let store: SqliteQuintStore;

  beforeEach(async () => {
    store = new SqliteQuintStore({ path: ':memory:' });
    await store.open();
  });

  afterEach(async () => {
    await store.close();
  });

  describe('Insert Performance', () => {
    it('should benchmark batch insert of 1000 quints', async () => {
      const quints = generateQuints(1000);
      
      const { duration } = await measure(async () => {
        await store.addAll(quints);
      });

      console.log(`Insert 1000 quints: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      const count = await store.count();
      expect(count).toBe(1000);
    });

    it('should benchmark batch insert of 10000 quints', async () => {
      const quints = generateQuints(10000);
      
      const { duration } = await measure(async () => {
        await store.addAll(quints);
      });

      console.log(`Insert 10000 quints: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      
      const count = await store.count();
      expect(count).toBe(10000);
    });
  });

  describe('Query Performance', () => {
    beforeEach(async () => {
      const quints = generateQuints(5000);
      await store.addAll(quints);
    });

    it('should benchmark pattern match by subject', async () => {
      const { result, duration } = await measure(async () => {
        return store.match({
          subject: namedNode('http://example.org/subject500'),
        });
      });

      console.log(`Match by subject (5000 quints): ${duration.toFixed(2)}ms, found ${result.length}`);
      expect(duration).toBeLessThan(100);
      expect(result.length).toBe(1);
    });

    it('should benchmark pattern match by predicate', async () => {
      const { result, duration } = await measure(async () => {
        return store.match({
          predicate: namedNode('http://example.org/predicate0'),
        });
      });

      console.log(`Match by predicate (5000 quints): ${duration.toFixed(2)}ms, found ${result.length}`);
      expect(duration).toBeLessThan(200);
      expect(result.length).toBe(500); // 5000 / 10 predicates
    });

    it('should benchmark graph prefix query', async () => {
      const { result, duration } = await measure(async () => {
        return store.match({ graph: { $startsWith: 'http://example.org/graph/1' } });
      });

      console.log(`Graph prefix query (5000 quints): ${duration.toFixed(2)}ms, found ${result.length}`);
      expect(duration).toBeLessThan(200);
      // Graph prefix "http://example.org/graph/1" should match graphs /1, /10-19
      // Each graph has 100 quints, so should find 100 quints for /1
      expect(result.length).toBeGreaterThanOrEqual(100);
    });
  });

  describe('SPARQL Query Performance', () => {
    let engine: ComunicaQuintEngine;

    beforeEach(async () => {
      // Use default graph for SPARQL queries
      const quints: Quint[] = [];
      for (let i = 0; i < 1000; i++) {
        quints.push({
          graph: defaultGraph(),
          subject: namedNode(`http://example.org/person${i}`),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal(`Person ${i}`),
        });
        quints.push({
          graph: defaultGraph(),
          subject: namedNode(`http://example.org/person${i}`),
          predicate: namedNode('http://xmlns.com/foaf/0.1/age'),
          object: literal(String(20 + (i % 50)), namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        });
      }
      await store.addAll(quints);
      engine = new ComunicaQuintEngine(store);
    });

    afterEach(async () => {
      await engine.close();
    });

    it('should benchmark simple SELECT query', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?name WHERE {
          ?p foaf:name ?name
        }
        LIMIT 100
      `;

      const { result, duration } = await measure(async () => {
        return engine.queryBindings(query);
      });

      console.log(`Simple SELECT (2000 quints): ${duration.toFixed(2)}ms, found ${result.bindings.length}`);
      expect(duration).toBeLessThan(2000);
      expect(result.bindings.length).toBe(100);
    });

    it('should benchmark filtered SELECT query', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?name ?age WHERE {
          ?p foaf:name ?name .
          ?p foaf:age ?age .
          FILTER(?age > 60)
        }
      `;

      const { result, duration } = await measure(async () => {
        return engine.queryBindings(query);
      });

      console.log(`Filtered SELECT (2000 quints): ${duration.toFixed(2)}ms, found ${result.bindings.length}`);
      expect(duration).toBeLessThan(3000);
    });

    it('should benchmark COUNT aggregate query', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT (COUNT(?p) AS ?count) WHERE {
          ?p foaf:name ?name
        }
      `;

      const { result, duration } = await measure(async () => {
        return engine.queryBindings(query);
      });

      console.log(`COUNT aggregate (2000 quints): ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(2000);
      expect(result.bindings[0].get('count')?.value).toBe('1000');
    });
  });

  describe('Comparison with N3Store', () => {
    it('should compare insert performance with N3Store', async () => {
      const quints = generateQuints(1000);
      
      // QuintStore insert
      const { duration: quintDuration } = await measure(async () => {
        await store.addAll(quints);
      });

      // N3Store insert
      const n3Store = new N3Store();
      const n3Duration = await measure(async () => {
        for (const quint of quints) {
          n3Store.addQuad(
            quint.subject,
            quint.predicate,
            quint.object,
            quint.graph
          );
        }
      });

      console.log(`Insert 1000 - QuintStore: ${quintDuration.toFixed(2)}ms, N3Store: ${n3Duration.duration.toFixed(2)}ms`);
      console.log(`Ratio: ${(quintDuration / n3Duration.duration).toFixed(2)}x`);
      
      // QuintStore may be slower due to SQLite overhead, but should be reasonable
      expect(quintDuration).toBeLessThan(5000);
    });

    it('should compare query performance with N3Store', async () => {
      const quints = generateQuints(5000);
      await store.addAll(quints);

      // QuintStore query
      const { duration: quintDuration, result: quintResult } = await measure(async () => {
        return store.match({
          predicate: namedNode('http://example.org/predicate0'),
        });
      });

      // N3Store query
      const n3Store = new N3Store();
      for (const quint of quints) {
        n3Store.addQuad(quint.subject, quint.predicate, quint.object, quint.graph);
      }

      const { duration: n3Duration, result: n3Result } = await measure(async () => {
        return n3Store.getQuads(null, namedNode('http://example.org/predicate0'), null, null);
      });

      console.log(`Query by predicate - QuintStore: ${quintDuration.toFixed(2)}ms (${quintResult.length}), N3Store: ${n3Duration.toFixed(2)}ms (${n3Result.length})`);
      console.log(`Ratio: ${(quintDuration / n3Duration).toFixed(2)}x`);

      expect(quintResult.length).toBe(n3Result.length);
    });
  });

  describe('Graph Prefix Query Performance', () => {
    it('should demonstrate graph prefix query advantage', async () => {
      // Create data with hierarchical graph structure
      const quints: Quint[] = [];
      
      // 100 users, each with 100 quints across different sub-graphs
      for (let user = 0; user < 100; user++) {
        for (let i = 0; i < 100; i++) {
          quints.push({
            graph: namedNode(`http://example.org/users/user${user}/data${i % 10}`),
            subject: namedNode(`http://example.org/item${user}_${i}`),
            predicate: namedNode('http://example.org/value'),
            object: literal(`value${i}`),
          });
        }
      }
      
      await store.addAll(quints);
      console.log(`Loaded ${quints.length} quints`);

      // Query for a specific user's data using graph prefix
      const { duration: prefixDuration, result: prefixResult } = await measure(async () => {
        return store.match({ graph: { $startsWith: 'http://example.org/users/user50/' } });
      });

      // Query all data and filter (simulating no graph prefix support)
      const { duration: fullDuration, result: fullResult } = await measure(async () => {
        const all = await store.match({});
        return all.filter(q => q.graph.value.startsWith('http://example.org/users/user50/'));
      });

      console.log(`Graph prefix query: ${prefixDuration.toFixed(2)}ms (${prefixResult.length} results)`);
      console.log(`Full scan + filter: ${fullDuration.toFixed(2)}ms (${fullResult.length} results)`);
      console.log(`Speedup: ${(fullDuration / prefixDuration).toFixed(2)}x`);

      expect(prefixResult.length).toBe(fullResult.length);
      expect(prefixResult.length).toBe(100);
      
      // Graph prefix should be faster
      expect(prefixDuration).toBeLessThan(fullDuration);
    });
  });
});
