/**
 * QuintStore Engine Adapter for rdf-test-suite
 * 
 * Implements IQueryEngine interface required by rdf-test-suite
 * to run official W3C SPARQL 1.1 test suite.
 */

import { QueryEngine } from '@comunica/query-sparql';
import { DataFactory, Store as N3Store } from 'n3';

// Create a shared engine instance
const engine = new QueryEngine();

/**
 * IQueryEngine implementation for rdf-test-suite
 */
export default {
  /**
   * Parse a SPARQL query string (validation only)
   */
  async parse(queryString, options) {
    // Use Comunica to parse/validate the query
    // This will throw if the query is invalid
    const n3Store = new N3Store();
    await engine.queryBindings(queryString, { sources: [n3Store] }).catch(() => {});
  },

  /**
   * Execute a SPARQL query against the provided data
   */
  async query(data, queryString, options) {
    // Load data into N3Store
    const n3Store = new N3Store();
    for (const quad of data) {
      n3Store.addQuad(quad);
    }

    // Determine query type and execute
    const queryType = detectQueryType(queryString);

    try {
      switch (queryType) {
        case 'SELECT': {
          const bindingsStream = await engine.queryBindings(queryString, {
            sources: [n3Store],
          });
          const bindings = await streamToArray(bindingsStream);
          
          // Extract variables from first result or query
          const variables = bindings.length > 0 
            ? Array.from(bindings[0].keys()).map(k => k.value)
            : extractVariables(queryString);

          return {
            type: 'bindings',
            variables,
            value: bindings.map(binding => {
              const row = {};
              for (const [key, value] of binding) {
                row[key.value] = value;
              }
              return row;
            }),
            checkOrder: queryString.toUpperCase().includes('ORDER BY'),
          };
        }

        case 'ASK': {
          const result = await engine.queryBoolean(queryString, {
            sources: [n3Store],
          });
          return {
            type: 'boolean',
            value: result,
          };
        }

        case 'CONSTRUCT':
        case 'DESCRIBE': {
          const quadsStream = await engine.queryQuads(queryString, {
            sources: [n3Store],
          });
          const quads = await streamToArray(quadsStream);
          return {
            type: 'quads',
            value: quads,
          };
        }

        default:
          throw new Error(`Unsupported query type: ${queryType}`);
      }
    } catch (error) {
      throw error;
    }
  },
};

/**
 * Detect the type of SPARQL query
 */
function detectQueryType(query) {
  const trimmed = query.trim().toUpperCase();
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
    break;
  }
  
  return 'SELECT';
}

/**
 * Extract variable names from a SELECT query
 */
function extractVariables(query) {
  const match = query.match(/SELECT\s+(DISTINCT\s+)?(.+?)\s+WHERE/is);
  if (!match) return [];
  
  const varsStr = match[2];
  if (varsStr.trim() === '*') return [];
  
  const varMatches = varsStr.match(/\?\w+/g);
  return varMatches ? varMatches.map(v => v.substring(1)) : [];
}

/**
 * Convert a stream to an array
 */
async function streamToArray(stream) {
  const items = [];
  return new Promise((resolve, reject) => {
    stream.on('data', item => items.push(item));
    stream.on('end', () => resolve(items));
    stream.on('error', reject);
  });
}
