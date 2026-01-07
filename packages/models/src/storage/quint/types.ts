/**
 * QuintStore Types
 * 
 * Quint = G, S, P, O, V (Graph, Subject, Predicate, Object, Vector)
 * Extends RDF Quad with vector embedding support for semantic search
 */

import type { Term, Quad } from '@rdfjs/types';

/**
 * A Quint extends the RDF Quad with an optional vector embedding
 */
export interface Quint {
  graph: Term;
  subject: Term;
  predicate: Term;
  object: Term;
  vector?: number[];
}

/**
 * Serialized form of a Quint for storage
 */
export interface SerializedQuint {
  graph: string;
  subject: string;
  predicate: string;
  object: string;
  vector: string | null;
}

/**
 * Match operators for term queries
 */
export interface TermOperators {
  /** Equal (explicit, same as direct Term match) */
  $eq?: string;
  /** Not equal */
  $ne?: string;
  /** Greater than */
  $gt?: string;
  /** Greater than or equal */
  $gte?: string;
  /** Less than */
  $lt?: string;
  /** Less than or equal */
  $lte?: string;
  /** In list */
  $in?: string[];
  /** Not in list */
  $notIn?: string[];
  /** Prefix match (startsWith) */
  $startsWith?: string;
  /** Suffix match (endsWith) - no index, slow */
  $endsWith?: string;
  /** Contains substring */
  $contains?: string;
  /** Regex match */
  $regex?: string;
  /** Is null */
  $isNull?: boolean;
}

/**
 * Term match can be exact Term or operators
 */
export type TermMatch = Term | TermOperators;

/**
 * Pattern for querying quints
 */
export interface QuintPattern {
  graph?: TermMatch;
  subject?: TermMatch;
  predicate?: TermMatch;
  object?: TermMatch;
}

/**
 * Check if a value is a Term (has termType property)
 */
export function isTerm(value: TermMatch): value is Term {
  return value !== null && typeof value === 'object' && 'termType' in value;
}

/**
 * Options for creating a QuintStore
 */
export interface QuintStoreOptions {
  /** Path to SQLite database file (use :memory: for in-memory) */
  path?: string;
  /** Enable WAL mode for better concurrent access */
  walMode?: boolean;
}

/**
 * Core QuintStore interface
 */
export interface QuintStore {
  /** Add a quint to the store */
  add(quint: Quint): Promise<void>;
  
  /** Add multiple quints in a batch */
  addAll(quints: Quint[]): Promise<void>;
  
  /** Remove a quint from the store */
  remove(quint: Quint): Promise<void>;
  
  /** Remove all quints matching a pattern */
  removeMatching(pattern: QuintPattern): Promise<number>;
  
  /** Get all quints matching a pattern */
  match(pattern: QuintPattern): Promise<Quint[]>;
  
  /** Count quints matching a pattern */
  count(pattern?: QuintPattern): Promise<number>;
  
  /** Clear all quints */
  clear(): Promise<void>;
  
  /** Close the store and release resources */
  close(): Promise<void>;
}

/**
 * Convert a Quad to a Quint (without vector)
 */
export function quadToQuint(quad: Quad): Quint {
  return {
    graph: quad.graph,
    subject: quad.subject,
    predicate: quad.predicate,
    object: quad.object,
  };
}

/**
 * Convert a Quint to a Quad (drops vector)
 */
export function quintToQuad(quint: Quint, dataFactory: { quad: Function }): Quad {
  return dataFactory.quad(
    quint.subject,
    quint.predicate,
    quint.object,
    quint.graph
  );
}
