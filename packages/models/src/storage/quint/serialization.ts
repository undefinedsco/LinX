/**
 * Term Serialization for QuintStore
 * 
 * Uses n3's termToId/termFromId for consistent RDF term serialization.
 * Adds fpstring encoding for numeric literals to enable sortable numeric comparisons.
 * 
 * Format:
 * - NamedNode: http://example.org/foo (no angle brackets in storage)
 * - Literal: "value" or "value"@lang or "value"^^<datatype>
 * - BlankNode: _:id
 * 
 * Numeric literals get special encoding:
 * - N\0{fpstring}\0{datatype}\0{originalValue}
 * Where fpstring preserves numeric ordering in string comparison.
 * 
 * DateTime literals:
 * - D\0{fpstring(timestamp)}\0{originalValue}
 */

import { DataFactory } from 'n3';
import type { Term, NamedNode, Literal, BlankNode, DefaultGraph } from '@rdfjs/types';
import { termToId as n3TermToId, termFromId as n3TermFromId } from 'n3';

// Null byte separator - safe because it can't appear in URIs or literals
const SEP = '\u0000';

// XSD numeric types
const NUMERIC_TYPES = new Set([
  'http://www.w3.org/2001/XMLSchema#integer',
  'http://www.w3.org/2001/XMLSchema#decimal',
  'http://www.w3.org/2001/XMLSchema#float',
  'http://www.w3.org/2001/XMLSchema#double',
  'http://www.w3.org/2001/XMLSchema#nonNegativeInteger',
  'http://www.w3.org/2001/XMLSchema#positiveInteger',
  'http://www.w3.org/2001/XMLSchema#nonPositiveInteger',
  'http://www.w3.org/2001/XMLSchema#negativeInteger',
  'http://www.w3.org/2001/XMLSchema#long',
  'http://www.w3.org/2001/XMLSchema#int',
  'http://www.w3.org/2001/XMLSchema#short',
  'http://www.w3.org/2001/XMLSchema#byte',
  'http://www.w3.org/2001/XMLSchema#unsignedLong',
  'http://www.w3.org/2001/XMLSchema#unsignedInt',
  'http://www.w3.org/2001/XMLSchema#unsignedShort',
  'http://www.w3.org/2001/XMLSchema#unsignedByte',
]);

const DATETIME_TYPE = 'http://www.w3.org/2001/XMLSchema#dateTime';

/**
 * Encode a number to a sortable string (fpstring encoding).
 * 
 * This encoding preserves numeric ordering when compared lexicographically:
 * - Negative numbers come before positive numbers
 * - Numbers with the same sign are ordered by magnitude
 * 
 * Format: {sign}{exponent}{mantissa}
 * - Sign: '0' for negative, '1' for zero, '2' for positive
 * - Exponent: 4-digit padded, inverted for negatives
 * - Mantissa: normalized decimal, inverted for negatives
 */
export function fpEncode(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return 'X' + value; // Non-numeric fallback
  }
  
  if (num === 0) {
    return '1' + '5000' + '0000000000000000';
  }
  
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  
  // Get exponent and mantissa
  const exp = absNum === 0 ? 0 : Math.floor(Math.log10(absNum));
  const mantissa = absNum / Math.pow(10, exp);
  
  // Normalize exponent to positive range (add 5000 for offset)
  let expStr: string;
  let mantissaStr: string;
  
  if (isNegative) {
    // For negative numbers, invert everything so smaller (more negative) comes first
    expStr = String(9999 - (exp + 5000)).padStart(4, '0');
    mantissaStr = invertDigits((mantissa * 1e15).toFixed(0).padStart(16, '0'));
    return '0' + expStr + mantissaStr;
  } else {
    expStr = String(exp + 5000).padStart(4, '0');
    mantissaStr = (mantissa * 1e15).toFixed(0).padStart(16, '0');
    return '2' + expStr + mantissaStr;
  }
}

/**
 * Decode an fpstring back to a number
 */
export function fpDecode(encoded: string): number {
  if (encoded.startsWith('X')) {
    return parseFloat(encoded.slice(1));
  }
  
  const sign = encoded[0];
  const expStr = encoded.slice(1, 5);
  const mantissaStr = encoded.slice(5);
  
  if (sign === '1') {
    return 0;
  }
  
  const isNegative = sign === '0';
  
  let exp: number;
  let mantissa: number;
  
  if (isNegative) {
    exp = (9999 - parseInt(expStr, 10)) - 5000;
    mantissa = parseInt(invertDigits(mantissaStr), 10) / 1e15;
    return -(mantissa * Math.pow(10, exp));
  } else {
    exp = parseInt(expStr, 10) - 5000;
    mantissa = parseInt(mantissaStr, 10) / 1e15;
    return mantissa * Math.pow(10, exp);
  }
}

function invertDigits(s: string): string {
  return s.split('').map(c => String(9 - parseInt(c, 10))).join('');
}

/**
 * Serialize an RDF Term to a string.
 * Uses n3's termToId format, with special encoding for numeric literals.
 */
export function serializeTerm(term: Term): string {
  // Use standard n3 serialization for non-object terms
  return n3TermToId(term as any);
}

/**
 * Serialize the object term with fpstring encoding for numerics.
 * This allows efficient range queries on numeric values.
 */
export function serializeObject(term: Term): string {
  if (term.termType !== 'Literal') {
    return n3TermToId(term as any);
  }
  
  const lit = term as Literal;
  const datatype = lit.datatype?.value;
  
  // Encode numeric literals with fpstring for sortable comparison
  if (datatype && NUMERIC_TYPES.has(datatype)) {
    const encoded = fpEncode(lit.value);
    return `N${SEP}${encoded}${SEP}${datatype}${SEP}${lit.value}`;
  }
  
  // Encode dateTime literals with fpstring timestamp
  if (datatype === DATETIME_TYPE) {
    const timestamp = new Date(lit.value).valueOf();
    if (!isNaN(timestamp)) {
      const encoded = fpEncode(timestamp);
      return `D${SEP}${encoded}${SEP}${lit.value}`;
    }
  }
  
  // Default to n3 serialization
  return n3TermToId(term as any);
}

/**
 * Deserialize a string back to an RDF Term.
 */
export function deserializeTerm(serialized: string): Term {
  return n3TermFromId(serialized, DataFactory) as Term;
}

/**
 * Deserialize an object string (handles fpstring-encoded numerics).
 */
export function deserializeObject(serialized: string): Term {
  // Handle fpstring-encoded numeric literal
  if (serialized.startsWith('N' + SEP)) {
    const parts = serialized.split(SEP);
    if (parts.length >= 4) {
      const [, , datatype, originalValue] = parts;
      return DataFactory.literal(originalValue, DataFactory.namedNode(datatype));
    }
  }
  
  // Handle fpstring-encoded dateTime literal
  if (serialized.startsWith('D' + SEP)) {
    const parts = serialized.split(SEP);
    if (parts.length >= 3) {
      const [, , originalValue] = parts;
      return DataFactory.literal(originalValue, DataFactory.namedNode(DATETIME_TYPE));
    }
  }
  
  // Default to n3 deserialization
  return n3TermFromId(serialized, DataFactory) as Term;
}

/**
 * Serialize a vector embedding to JSON string
 */
export function serializeVector(vector: number[] | undefined): string | null {
  if (!vector || vector.length === 0) {
    return null;
  }
  return JSON.stringify(vector);
}

/**
 * Deserialize a vector embedding from JSON string
 */
export function deserializeVector(serialized: string | null): number[] | undefined {
  if (!serialized) {
    return undefined;
  }
  try {
    return JSON.parse(serialized);
  } catch {
    return undefined;
  }
}
