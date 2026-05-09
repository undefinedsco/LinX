/**
 * Solid Pod Collection Adapter for TanStack DB
 * 
 * This adapter bridges TanStack DB collections with drizzle-solid,
 * enabling reactive data management with Solid Pod persistence.
 */

import type { PodTable, InferTableData, InferInsertData, InferUpdateData, QueryCondition } from '@undefineds.co/drizzle-solid'
import type { SolidDatabase } from '@undefineds.co/models'

/**
 * Options for creating a Solid Pod collection
 */
function isAbsoluteIri(value: string): boolean {
  return /^https?:\/\//.test(value)
}

function resolveSolidCollectionIri<TTable extends PodTable<any>>(table: TTable, id: string): string {
  if (isAbsoluteIri(id)) return id
  const relativeUri = typeof (table as any).resolveUri === 'function'
    ? (table as any).resolveUri(id)
    : id
  if (isAbsoluteIri(relativeUri)) return relativeUri
  throw new Error(`Solid collection mutation requires an absolute IRI or a table-resolved absolute IRI for id: ${id}`)
}

export interface SolidCollectionOptions<
  TTable extends PodTable<any>,
  TRow extends Record<string, unknown> = InferTableData<TTable>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _TInsert = InferInsertData<TTable>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _TUpdate = InferUpdateData<TTable>,
> {
  /** The drizzle-solid table schema */
  table: TTable
  
  /** Function to extract unique key from a row */
  getKey: (item: TRow) => string
  
  /** Optional: transform row from database to collection item */
  transform?: (row: InferTableData<TTable>) => TRow
  
  /** Optional: filter condition for queries */
  filter?: (table: TTable) => QueryCondition | undefined
  
  /** Optional: sort configuration */
  orderBy?: {
    column: keyof TRow & string
    direction?: 'asc' | 'desc'
  }
}

/**
 * Result type for solid collection options
 */
export interface SolidCollectionResult<
  TRow extends Record<string, unknown>,
  _TInsert,
  TUpdate,
> {
  /** Query function to fetch data from Pod */
  queryFn: (db: SolidDatabase) => Promise<TRow[]>
  
  /** Get unique key from item */
  getKey: (item: TRow) => string
  
  /** Handle insert mutation */
  onInsert: (db: SolidDatabase, item: TRow) => Promise<TRow>
  
  /** Handle update mutation */
  onUpdate: (db: SolidDatabase, id: string, updates: Partial<TUpdate>) => Promise<TRow | null>
  
  /** Handle delete mutation */
  onDelete: (db: SolidDatabase, id: string) => Promise<void>
}

/**
 * Create collection options for Solid Pod data source
 * 
 * @example
 * ```ts
 * const chatCollectionOptions = solidCollectionOptions({
 *   table: chatTable,
 *   getKey: (chat) => chat.id,
 *   orderBy: { column: 'lastActiveAt', direction: 'desc' },
 * })
 * ```
 */
export function solidCollectionOptions<
  TTable extends PodTable<any>,
  TRow extends Record<string, unknown> = InferTableData<TTable>,
  TInsert = InferInsertData<TTable>,
  TUpdate = InferUpdateData<TTable>,
>(
  options: SolidCollectionOptions<TTable, TRow, TInsert, TUpdate>
): SolidCollectionResult<TRow, TInsert, TUpdate> {
  const { table, getKey, transform, filter, orderBy } = options
  
  const transformRow = transform ?? ((row: InferTableData<TTable>) => row as unknown as TRow)
  
  const queryFn = async (db: SolidDatabase): Promise<TRow[]> => {
    let query = db.select().from(table)
    
    const whereClause = filter?.(table)
    if (whereClause) {
      query = query.where(whereClause)
    }
    
    if (orderBy) {
      const column = (table as unknown as Record<string, unknown>)[orderBy.column] as string | undefined
      if (column) {
        query = query.orderBy(column, orderBy.direction ?? 'asc')
      }
    }
    
    const rows = await query.execute()
    return rows.map(row => transformRow(row as InferTableData<TTable>))
  }
  
  const onInsert = async (db: SolidDatabase, item: TRow): Promise<TRow> => {
    const rows = await db.insert(table).values(item as InferInsertData<TTable>).execute()
    const created = rows?.[0]
    if (created) {
      return transformRow(created as InferTableData<TTable>)
    }
    // Fallback: return the input item with generated ID
    return item
  }
  
  const onUpdate = async (
    db: SolidDatabase,
    id: string,
    updates: Partial<TUpdate>
  ): Promise<TRow | null> => {
    const iri = resolveSolidCollectionIri(table, id)
    const updateByIri = (db as unknown as { updateByIri?: (table: TTable, iri: string, data: Partial<TUpdate>) => Promise<InferTableData<TTable> | null> }).updateByIri
    if (typeof updateByIri === 'function') {
      const updated = await updateByIri.call(db, table, iri, updates)
      return updated ? transformRow(updated) : null
    }

    const query = db.update(table).set(updates as InferUpdateData<TTable>)
    const scopedQuery = typeof (query as any).whereByIri === 'function'
      ? (query as any).whereByIri(iri)
      : query.where({ '@id': iri } as unknown as QueryCondition)
    await scopedQuery.execute()
    
    const record = typeof (db as unknown as { findByIri?: (table: TTable, iri: string) => Promise<InferTableData<TTable> | null> }).findByIri === 'function'
      ? await (db as unknown as { findByIri: (table: TTable, iri: string) => Promise<InferTableData<TTable> | null> }).findByIri(table, iri)
      : null
    return record ? transformRow(record as InferTableData<TTable>) : null
  }
  
  const onDelete = async (db: SolidDatabase, id: string): Promise<void> => {
    const iri = resolveSolidCollectionIri(table, id)
    const deleteByIri = (db as unknown as { deleteByIri?: (table: TTable, iri: string) => Promise<unknown> }).deleteByIri
    if (typeof deleteByIri === 'function') {
      await deleteByIri.call(db, table, iri)
      return
    }

    const query = db.delete(table)
    const scopedQuery = typeof (query as any).whereByIri === 'function'
      ? (query as any).whereByIri(iri)
      : query.where({ '@id': iri } as unknown as QueryCondition)
    await scopedQuery.execute()
  }
  
  return {
    queryFn,
    getKey,
    onInsert,
    onUpdate,
    onDelete,
  }
}

/**
 * Helper to derive row ID from various sources
 */
export function deriveRowId(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null
  
  const explicit = row['@id']
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  
  const subject = row.subject
  if (typeof subject === 'string' && subject.length > 0) return subject
  
  const id = row.id
  if (typeof id === 'string' && id.length > 0) return id
  
  return null
}
