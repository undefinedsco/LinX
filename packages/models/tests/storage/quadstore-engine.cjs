/**
 * Quadstore Engine Adapter for rdf-test-suite
 * 
 * Uses quadstore + quadstore-comunica for W3C SPARQL tests
 * This is the baseline to compare against QuintStore
 */

const { MemoryLevel } = require('memory-level');
const { Quadstore } = require('quadstore');
const { Engine } = require('quadstore-comunica');
const { DataFactory } = require('n3');

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

/**
 * IQueryEngine implementation using quadstore-comunica
 */
module.exports = {
  /**
   * Parse a SPARQL query string (validation only)
   */
  async parse(queryString, options) {
    // Create a temporary store just for parsing
    const backend = new MemoryLevel();
    const store = new Quadstore({ backend, dataFactory: DataFactory });
    await store.open();
    const engine = new Engine(store);
    
    try {
      // Try to parse by executing against empty store
      await engine.queryBindings(queryString);
    } catch (e) {
      if (e.message && e.message.includes('Parse error')) {
        throw e;
      }
    } finally {
      await store.close();
    }
  },

  /**
   * Execute a SPARQL query against the provided data
   */
  async query(data, queryString, options) {
    // Create quadstore with memory backend
    const backend = new MemoryLevel();
    const store = new Quadstore({ backend, dataFactory: DataFactory });
    await store.open();
    
    // Load data into quadstore
    if (data && data.length > 0) {
      await store.multiPut(data);
    }
    
    // Create comunica engine backed by quadstore
    const engine = new Engine(store);
    
    // Determine query type and execute
    const queryType = detectQueryType(queryString);

    try {
      switch (queryType) {
        case 'SELECT': {
          const bindingsStream = await engine.queryBindings(queryString);
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
          const result = await engine.queryBoolean(queryString);
          return {
            type: 'boolean',
            value: result,
          };
        }

        case 'CONSTRUCT':
        case 'DESCRIBE': {
          const quadsStream = await engine.queryQuads(queryString);
          const quads = await streamToArray(quadsStream);
          return {
            type: 'quads',
            value: quads,
          };
        }

        default:
          throw new Error(`Unsupported query type: ${queryType}`);
      }
    } finally {
      await store.close();
    }
  },
};
