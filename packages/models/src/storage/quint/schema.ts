/**
 * Drizzle Schema for QuintStore
 * 
 * Uses SQLite with 6 composite indexes aligned with quadstore:
 * - SPOG: Subject, Predicate, Object, Graph
 * - OGSP: Object, Graph, Subject, Predicate
 * - GSPO: Graph, Subject, Predicate, Object
 * - SOPG: Subject, Object, Predicate, Graph
 * - POGS: Predicate, Object, Graph, Subject
 * - GPOS: Graph, Predicate, Object, Subject
 */

import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';

export const quints = sqliteTable('quints', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  graph: text('graph').notNull(),
  subject: text('subject').notNull(),
  predicate: text('predicate').notNull(),
  object: text('object').notNull(),
}, (table) => ({
  // Unique constraint on all 4 RDF terms
  uniq: unique().on(table.graph, table.subject, table.predicate, table.object),
  
  // 6 indexes aligned with quadstore for efficient pattern matching
  idx_spog: index('idx_spog').on(table.subject, table.predicate, table.object, table.graph),
  idx_ogsp: index('idx_ogsp').on(table.object, table.graph, table.subject, table.predicate),
  idx_gspo: index('idx_gspo').on(table.graph, table.subject, table.predicate, table.object),
  idx_sopg: index('idx_sopg').on(table.subject, table.object, table.predicate, table.graph),
  idx_pogs: index('idx_pogs').on(table.predicate, table.object, table.graph, table.subject),
  idx_gpos: index('idx_gpos').on(table.graph, table.predicate, table.object, table.subject),
}));

export type QuintRow = typeof quints.$inferSelect;
export type QuintInsert = typeof quints.$inferInsert;
