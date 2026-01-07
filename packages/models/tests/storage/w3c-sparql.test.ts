/**
 * W3C SPARQL 1.1 Test Suite for QuintStore
 * 
 * Tests core SPARQL 1.1 Query features against QuintStore + ComunicaQuintEngine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataFactory } from 'n3';
import { SqliteQuintStore } from '../../src/storage/quint/SqliteQuintStore';
import { ComunicaQuintEngine } from '../../src/storage/sparql/ComunicaQuintEngine';

const { namedNode, literal, defaultGraph } = DataFactory;

describe('W3C SPARQL 1.1 Query Tests', () => {
  let store: SqliteQuintStore;
  let engine: ComunicaQuintEngine;

  beforeEach(async () => {
    store = new SqliteQuintStore({ path: ':memory:' });
    await store.open();
    engine = new ComunicaQuintEngine(store);
  });

  afterEach(async () => {
    await engine.close();
  });

  describe('Basic Graph Patterns', () => {
    beforeEach(async () => {
      // Load test data
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/book/book1'),
          predicate: namedNode('http://purl.org/dc/elements/1.1/title'),
          object: literal('SPARQL Tutorial'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/book/book1'),
          predicate: namedNode('http://purl.org/dc/elements/1.1/creator'),
          object: literal('Alice'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/book/book2'),
          predicate: namedNode('http://purl.org/dc/elements/1.1/title'),
          object: literal('The Semantic Web'),
        },
      ]);
    });

    it('should match simple triple pattern', async () => {
      const query = `
        PREFIX dc: <http://purl.org/dc/elements/1.1/>
        SELECT ?title WHERE {
          ?x dc:title ?title
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(2);
    });

    it('should match multiple triple patterns', async () => {
      const query = `
        PREFIX dc: <http://purl.org/dc/elements/1.1/>
        SELECT ?title ?creator WHERE {
          ?x dc:title ?title .
          ?x dc:creator ?creator
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('title')?.value).toBe('SPARQL Tutorial');
      expect(result.bindings[0].get('creator')?.value).toBe('Alice');
    });
  });

  describe('FILTER', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/age'),
          object: literal('25', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/age'),
          object: literal('35', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p3'),
          predicate: namedNode('http://example.org/age'),
          object: literal('45', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
      ]);
    });

    it('should filter with comparison operator', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?p ?age WHERE {
          ?p ex:age ?age
          FILTER(?age > 30)
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(2);
    });

    it('should filter with REGEX', async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/name'),
          object: literal('Alice'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/name'),
          object: literal('Bob'),
        },
      ]);

      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?name WHERE {
          ?p ex:name ?name
          FILTER(REGEX(?name, "^A"))
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('name')?.value).toBe('Alice');
    });

    it('should filter with BOUND', async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/name'),
          object: literal('Alice'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/email'),
          object: literal('alice@example.org'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/name'),
          object: literal('Bob'),
        },
      ]);

      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?name WHERE {
          ?p ex:name ?name
          OPTIONAL { ?p ex:email ?email }
          FILTER(BOUND(?email))
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('name')?.value).toBe('Alice');
    });
  });

  describe('OPTIONAL', () => {
    beforeEach(async () => {
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
          predicate: namedNode('http://xmlns.com/foaf/0.1/mbox'),
          object: namedNode('mailto:alice@example.org'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/bob'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Bob'),
        },
      ]);
    });

    it('should handle OPTIONAL pattern', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?name ?mbox WHERE {
          ?x foaf:name ?name .
          OPTIONAL { ?x foaf:mbox ?mbox }
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(2);
      
      const alice = result.bindings.find(b => b.get('name')?.value === 'Alice');
      const bob = result.bindings.find(b => b.get('name')?.value === 'Bob');
      
      expect(alice?.get('mbox')?.value).toBe('mailto:alice@example.org');
      expect(bob?.get('mbox')).toBeUndefined();
    });
  });

  describe('UNION', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/book1'),
          predicate: namedNode('http://purl.org/dc/elements/1.1/title'),
          object: literal('Book One'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/book2'),
          predicate: namedNode('http://purl.org/dc/terms/title'),
          object: literal('Book Two'),
        },
      ]);
    });

    it('should handle UNION pattern', async () => {
      const query = `
        PREFIX dc10: <http://purl.org/dc/elements/1.1/>
        PREFIX dc11: <http://purl.org/dc/terms/>
        SELECT ?title WHERE {
          { ?book dc10:title ?title }
          UNION
          { ?book dc11:title ?title }
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(2);
    });
  });

  describe('ORDER BY', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/name'),
          object: literal('Charlie'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/name'),
          object: literal('Alice'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p3'),
          predicate: namedNode('http://example.org/name'),
          object: literal('Bob'),
        },
      ]);
    });

    it('should order results ascending', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?name WHERE {
          ?p ex:name ?name
        }
        ORDER BY ?name
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(3);
      expect(result.bindings[0].get('name')?.value).toBe('Alice');
      expect(result.bindings[1].get('name')?.value).toBe('Bob');
      expect(result.bindings[2].get('name')?.value).toBe('Charlie');
    });

    it('should order results descending', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?name WHERE {
          ?p ex:name ?name
        }
        ORDER BY DESC(?name)
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(3);
      expect(result.bindings[0].get('name')?.value).toBe('Charlie');
      expect(result.bindings[1].get('name')?.value).toBe('Bob');
      expect(result.bindings[2].get('name')?.value).toBe('Alice');
    });
  });

  describe('LIMIT and OFFSET', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 10; i++) {
        await store.add({
          graph: defaultGraph(),
          subject: namedNode(`http://example.org/item${i}`),
          predicate: namedNode('http://example.org/value'),
          object: literal(String(i), namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        });
      }
    });

    it('should limit results', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?item WHERE {
          ?item ex:value ?v
        }
        LIMIT 5
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(5);
    });

    it('should offset results', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?v WHERE {
          ?item ex:value ?v
        }
        ORDER BY ?v
        OFFSET 5
        LIMIT 3
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(3);
    });
  });

  describe('DISTINCT', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/type'),
          object: namedNode('http://example.org/Person'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/type'),
          object: namedNode('http://example.org/Person'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p3'),
          predicate: namedNode('http://example.org/type'),
          object: namedNode('http://example.org/Organization'),
        },
      ]);
    });

    it('should return distinct results', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT DISTINCT ?type WHERE {
          ?x ex:type ?type
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(2);
    });
  });

  describe('Aggregates', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/salary'),
          object: literal('50000', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/salary'),
          object: literal('60000', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p3'),
          predicate: namedNode('http://example.org/salary'),
          object: literal('70000', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
      ]);
    });

    it('should calculate COUNT', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT (COUNT(?p) AS ?count) WHERE {
          ?p ex:salary ?s
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('count')?.value).toBe('3');
    });

    it('should calculate SUM', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT (SUM(?s) AS ?total) WHERE {
          ?p ex:salary ?s
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('total')?.value).toBe('180000');
    });

    it('should calculate AVG', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT (AVG(?s) AS ?avg) WHERE {
          ?p ex:salary ?s
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('avg')?.value).toBe('60000');
    });
  });

  describe('GROUP BY', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/dept'),
          object: literal('Engineering'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/dept'),
          object: literal('Engineering'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p3'),
          predicate: namedNode('http://example.org/dept'),
          object: literal('Sales'),
        },
      ]);
    });

    it('should group results', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?dept (COUNT(?p) AS ?count) WHERE {
          ?p ex:dept ?dept
        }
        GROUP BY ?dept
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(2);
      
      const eng = result.bindings.find(b => b.get('dept')?.value === 'Engineering');
      const sales = result.bindings.find(b => b.get('dept')?.value === 'Sales');
      
      expect(eng?.get('count')?.value).toBe('2');
      expect(sales?.get('count')?.value).toBe('1');
    });
  });

  describe('HAVING', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/group'),
          object: literal('A'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/group'),
          object: literal('A'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p3'),
          predicate: namedNode('http://example.org/group'),
          object: literal('A'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p4'),
          predicate: namedNode('http://example.org/group'),
          object: literal('B'),
        },
      ]);
    });

    it('should filter groups with HAVING', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?grp (COUNT(?p) AS ?count) WHERE {
          ?p ex:group ?grp
        }
        GROUP BY ?grp
        HAVING (COUNT(?p) > 2)
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('grp')?.value).toBe('A');
    });
  });

  describe('ASK queries', () => {
    beforeEach(async () => {
      await store.add({
        graph: defaultGraph(),
        subject: namedNode('http://example.org/alice'),
        predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
        object: literal('Alice'),
      });
    });

    it('should return true when pattern matches', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        ASK { ?x foaf:name "Alice" }
      `;
      const result = await engine.queryBoolean(query);
      expect(result).toBe(true);
    });

    it('should return false when pattern does not match', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        ASK { ?x foaf:name "Bob" }
      `;
      const result = await engine.queryBoolean(query);
      expect(result).toBe(false);
    });
  });

  describe('CONSTRUCT queries', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/alice'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Alice'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/bob'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Bob'),
        },
      ]);
    });

    it('should construct new graph', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        CONSTRUCT {
          ?s ex:label ?name
        } WHERE {
          ?s foaf:name ?name
        }
      `;
      const result = await engine.queryQuads(query);
      expect(result).toHaveLength(2);
      result.forEach(quad => {
        expect(quad.predicate.value).toBe('http://example.org/label');
      });
    });
  });

  describe('Property Paths', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/alice'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/knows'),
          object: namedNode('http://example.org/bob'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/bob'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/knows'),
          object: namedNode('http://example.org/charlie'),
        },
      ]);
    });

    it('should match sequence path', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?friend WHERE {
          <http://example.org/alice> foaf:knows/foaf:knows ?friend
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('friend')?.value).toBe('http://example.org/charlie');
    });

    it('should match alternative path', async () => {
      await store.add({
        graph: defaultGraph(),
        subject: namedNode('http://example.org/alice'),
        predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
        object: literal('Alice'),
      });

      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?val WHERE {
          <http://example.org/alice> foaf:name|foaf:knows ?val
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Subqueries', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p1'),
          predicate: namedNode('http://example.org/score'),
          object: literal('85', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p2'),
          predicate: namedNode('http://example.org/score'),
          object: literal('90', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/p3'),
          predicate: namedNode('http://example.org/score'),
          object: literal('75', namedNode('http://www.w3.org/2001/XMLSchema#integer')),
        },
      ]);
    });

    it('should handle subquery', async () => {
      const query = `
        PREFIX ex: <http://example.org/>
        SELECT ?p ?score WHERE {
          ?p ex:score ?score .
          {
            SELECT (MAX(?s) AS ?maxScore) WHERE {
              ?x ex:score ?s
            }
          }
          FILTER(?score = ?maxScore)
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(1);
      expect(result.bindings[0].get('score')?.value).toBe('90');
    });
  });

  describe('VALUES', () => {
    beforeEach(async () => {
      await store.addAll([
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/alice'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Alice'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/bob'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Bob'),
        },
        {
          graph: defaultGraph(),
          subject: namedNode('http://example.org/charlie'),
          predicate: namedNode('http://xmlns.com/foaf/0.1/name'),
          object: literal('Charlie'),
        },
      ]);
    });

    it('should filter with VALUES clause', async () => {
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?name WHERE {
          VALUES ?person { <http://example.org/alice> <http://example.org/bob> }
          ?person foaf:name ?name
        }
      `;
      const result = await engine.queryBindings(query);
      expect(result.bindings).toHaveLength(2);
      const names = result.bindings.map(b => b.get('name')?.value);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
      expect(names).not.toContain('Charlie');
    });
  });
});
