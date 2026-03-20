/**
 * Solid Pod Collection Adapter for TanStack DB
 * 
 * This adapter bridges TanStack DB collections with drizzle-solid,
 * enabling reactive data management with Solid Pod persistence.
 */

import type { PodTable, InferTableData, InferInsertData, InferUpdateData, QueryCondition } from '@undefineds.co/drizzle-solid'
import {
  deleteExactRecord,
  findExactRecord,
  updateExactRecord,
  type SolidDatabase,
} from '@linx/models'

/**
 * Options for creating a Solid Pod collection
 */
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
    await updateExactRecord(db, table as any, id, updates as Record<string, unknown>)
    const record = await findExactRecord(db, table as any, id)
    return record ? transformRow(record as InferTableData<TTable>) : null
  }
  
  const onDelete = async (db: SolidDatabase, id: string): Promise<void> => {
    await deleteExactRecord(db, table as any, id)
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
