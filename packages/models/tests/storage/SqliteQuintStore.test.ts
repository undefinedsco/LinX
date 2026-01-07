/**
 * Tests for SqliteQuintStore
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataFactory } from 'n3';
import { SqliteQuintStore } from '../../src/storage/quint/SqliteQuintStore';
import type { Quint } from '../../src/storage/quint/types';

const { namedNode, literal, blankNode, defaultGraph } = DataFactory;

describe('SqliteQuintStore', () => {
  let store: SqliteQuintStore;

  beforeEach(async () => {
    store = new SqliteQuintStore({ path: ':memory:' });
    await store.open();
  });

  afterEach(async () => {
    await store.close();
  });

  describe('basic operations', () => {
    it('should add and retrieve a quint', async () => {
      const quint: Quint = {
        graph: namedNode('http://example.org/graph1'),
        subject: namedNode('http://example.org/subject1'),
        predicate: namedNode('http://example.org/predicate1'),
        object: literal('value1'),
      };

      await store.add(quint);
      const results = await store.match({});

      expect(results).toHaveLength(1);
      expect(results[0].subject.value).toBe('http://example.org/subject1');
      expect(results[0].object.value).toBe('value1');
    });

    it('should add multiple quints in batch', async () => {
      const quints: Quint[] = [
        {
          graph: namedNode('http://example.org/graph1'),
          subject: namedNode('http://example.org/s1'),
          predicate: namedNode('http://example.org/p1'),
          object: literal('v1'),
        },
        {
          graph: namedNode('http://example.org/graph1'),
          subject: namedNode('http://example.org/s2'),
          predicate: namedNode('http://example.org/p2'),
          object: literal('v2'),
        },
      ];

      await store.addAll(quints);
      const count = await store.count();

      expect(count).toBe(2);
    });

    it('should remove a quint', async () => {
      const quint: Quint = {
        graph: namedNode('http://example.org/graph1'),
        subject: namedNode('http://example.org/subject1'),
        predicate: namedNode('http://example.org/predicate1'),
        object: literal('value1'),
      };

      await store.add(quint);
      expect(await store.count()).toBe(1);

      await store.remove(quint);
      expect(await store.count()).toBe(0);
    });

    it('should clear all quints', async () => {
      await store.addAll([
        {
          graph: namedNode('http://example.org/g1'),
          subject: namedNode('http://example.org/s1'),
          predicate: namedNode('http://example.org/p1'),
          object: literal('v1'),
        },
        {
          graph: namedNode('http://example.org/g2'),
          subject: namedNode('http://example.org/s2'),
          predicate: namedNode('http://example.org/p2'),
          object: literal('v2'),
        },
      ]);

      expect(await store.count()).toBe(2);

      await store.clear();
      expect(await store.count()).toBe(0);
    });
  });

  describe('pattern matching', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: namedNode('http://example.org/graph1'),
          subject: namedNode('http://example.org/alice'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Alice'),
        },
        {
          graph: namedNode('http://example.org/graph1'),
          subject: namedNode('http://example.org/alice'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/age'),
          object: literal('30', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
        {
          graph: namedNode('http://example.org/graph2'),
          subject: namedNode('http://example.org/bob'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Bob'),
        },
      ]);
    });

    it('should match by subject', async () => {
      const results = await store.match({
        subject: namedNode('http://example.org/alice'),
      });

      expect(results).toHaveLength(2);
    });

    it('should match by predicate', async () => {
      const results = await store.match({
        predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
      });

      expect(results).toHaveLength(2);
    });

    it('should match by graph', async () => {
      const results = await store.match({
        graph: namedNode('http://example.org/graph1'),
      });

      expect(results).toHaveLength(2);
    });

    it('should match by multiple criteria', async () => {
      const results = await store.match({
        graph: namedNode('http://example.org/graph1'),
        predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
      });

      expect(results).toHaveLength(1);
      expect(results[0].object.value).toBe('Alice');
    });
  });

  describe('graph prefix queries', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: namedNode('http://example.org/users/alice/profile'),
          subject: namedNode('http://example.org/alice'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Alice'),
        },
        {
          graph: namedNode('http://example.org/users/alice/settings'),
          subject: namedNode('http://example.org/alice'),
          predicate: namedNode('http://example.org/theme'),
          object: literal('dark'),
        },
        {
          graph: namedNode('http://example.org/users/bob/profile'),
          subject: namedNode('http://example.org/bob'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Bob'),
        },
        {
          graph: namedNode('http://example.org/public/data'),
          subject: namedNode('http://example.org/info'),
          predicate: namedNode('http://example.org/value'),
          object: literal('public'),
        },
      ]);
    });

    it('should filter by graph prefix', async () => {
      const results = await store.match({ 
        graph: { $startsWith: 'http://example.org/users/alice/' } 
      });

      expect(results).toHaveLength(2);
      results.forEach(r => {
        expect(r.graph.value).toContain('http://example.org/users/alice/');
      });
    });

    it('should match all user graphs with prefix', async () => {
      const results = await store.match({ 
        graph: { $startsWith: 'http://example.org/users/' } 
      });

      expect(results).toHaveLength(3);
    });

    it('should not match unrelated graphs', async () => {
      const results = await store.match({ 
        graph: { $startsWith: 'http://example.org/admin/' } 
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('term types', () => {
    it('should handle NamedNode correctly', async () => {
      const quint: Quint = {
        graph: namedNode('http://example.org/g'),
        subject: namedNode('http://example.org/s'),
        predicate: namedNode('http://example.org/p'),
        object: namedNode('http://example.org/o'),
      };

      await store.add(quint);
      const results = await store.match({});

      expect(results[0].object.termType).toBe('NamedNode');
      expect(results[0].object.value).toBe('http://example.org/o');
    });

    it('should handle BlankNode correctly', async () => {
      const quint: Quint = {
        graph: namedNode('http://example.org/g'),
        subject: blankNode('b1'),
        predicate: namedNode('http://example.org/p'),
        object: literal('value'),
      };

      await store.add(quint);
      const results = await store.match({});

      expect(results[0].subject.termType).toBe('BlankNode');
    });

    it('should handle typed literals correctly', async () => {
      const quint: Quint = {
        graph: namedNode('http://example.org/g'),
        subject: namedNode('http://example.org/s'),
        predicate: namedNode('http://example.org/age'),
        object: literal('25', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
      };

      await store.add(quint);
      const results = await store.match({});

      expect(results[0].object.termType).toBe('Literal');
      expect(results[0].object.value).toBe('25');
      expect((results[0].object as any).datatype.value).toBe('http://www.w3.org/2001/XMLSchema#integer');
    });

    it('should handle language-tagged literals correctly', async () => {
      const quint: Quint = {
        graph: namedNode('http://example.org/g'),
        subject: namedNode('http://example.org/s'),
        predicate: namedNode('http://example.org/label'),
        object: literal('Hello', 'en'),
      };

      await store.add(quint);
      const results = await store.match({});

      expect(results[0].object.termType).toBe('Literal');
      expect(results[0].object.value).toBe('Hello');
      expect((results[0].object as any).language).toBe('en');
    });
  });

  describe('removeMatching', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: namedNode('http://example.org/g1'),
          subject: namedNode('http://example.org/s1'),
          predicate: namedNode('http://example.org/p1'),
          object: literal('v1'),
        },
        {
          graph: namedNode('http://example.org/g1'),
          subject: namedNode('http://example.org/s2'),
          predicate: namedNode('http://example.org/p2'),
          object: literal('v2'),
        },
        {
          graph: namedNode('http://example.org/g2'),
          subject: namedNode('http://example.org/s3'),
          predicate: namedNode('http://example.org/p3'),
          object: literal('v3'),
        },
      ]);
    });

    it('should remove all quints matching a graph', async () => {
      const removed = await store.removeMatching({
        graph: namedNode('http://example.org/g1'),
      });

      expect(removed).toBe(2);
      expect(await store.count()).toBe(1);
    });

    it('should remove quints matching graph prefix', async () => {
      await store.addAll([
        {
          graph: namedNode('http://example.org/users/alice/data'),
          subject: namedNode('http://example.org/s'),
          predicate: namedNode('http://example.org/p'),
          object: literal('v'),
        },
      ]);

      const removed = await store.removeMatching({
        graph: { $startsWith: 'http://example.org/users/' },
      });

      expect(removed).toBe(1);
    });
  });
});
