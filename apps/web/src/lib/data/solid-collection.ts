/**
 * Solid Pod Collection Adapter for TanStack DB
 * 
 * This adapter bridges TanStack DB collections with drizzle-solid,
 * enabling reactive data management with Solid Pod persistence.
 */

import type { PodResource as PodResourceSchema, InferTableData, InferInsertData, InferUpdateData, QueryCondition } from '@undefineds.co/drizzle-solid'
import type { SolidDatabase } from '@undefineds.co/models'
import { requireRowResourceId } from './resource-identity'
import { deleteExactRecord, findExactRecord, updateExactRecord } from './exact-records'

/**
 * Options for creating a Solid Pod collection
 */
export interface SolidCollectionOptions<
  TResource extends PodResourceSchema<any>,
  TRow extends Record<string, unknown> = InferTableData<TResource>,
  _TInsert = InferInsertData<TResource>,
  _TUpdate = InferUpdateData<TResource>,
> {
  /** The drizzle-solid resource schema */
  resource: TResource
  
  /** Function to extract unique key from a row */
  getKey: (item: TRow) => string
  
  /** Optional: transform row from database to collection item */
  transform?: (row: InferTableData<TResource>) => TRow
  
  /** Optional: filter condition for queries */
  filter?: (resource: TResource) => QueryCondition | undefined
  
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
 *   resource: chatResource,
 *   getKey: (chat) => chat.id,
 *   orderBy: { column: 'lastActiveAt', direction: 'desc' },
 * })
 * ```
 */
export function solidCollectionOptions<
  TResource extends PodResourceSchema<any>,
  TRow extends Record<string, unknown> = InferTableData<TResource>,
  TInsert = InferInsertData<TResource>,
  TUpdate = InferUpdateData<TResource>,
>(
  options: SolidCollectionOptions<TResource, TRow, TInsert, TUpdate>
): SolidCollectionResult<TRow, TInsert, TUpdate> {
  const { resource, getKey, transform, filter, orderBy } = options
  
  const transformRow = transform ?? ((row: InferTableData<TResource>) => row as unknown as TRow)
  
  const queryFn = async (db: SolidDatabase): Promise<TRow[]> => {
    let query = db.select().from(resource)
    
    const whereClause = filter?.(resource)
    if (whereClause) {
      query = query.where(whereClause)
    }
    
    if (orderBy) {
      const column = (resource as unknown as Record<string, unknown>)[orderBy.column] as string | undefined
      if (column) {
        query = query.orderBy(column, orderBy.direction ?? 'asc')
      }
    }
    
    const rows = await query.execute()
    return rows.map(row => transformRow(row as InferTableData<TResource>))
  }
  
  const onInsert = async (db: SolidDatabase, item: TRow): Promise<TRow> => {
    const rows = await db.insert(resource).values(item as InferInsertData<TResource>).execute()
    const created = rows?.[0]
    if (created) {
      return transformRow(created as InferTableData<TResource>)
    }
    // Fallback: return the input item with generated ID
    return item
  }
  
  const onUpdate = async (
    db: SolidDatabase,
    id: string,
    updates: Partial<TUpdate>
  ): Promise<TRow | null> => {
    await updateExactRecord(db, resource as any, id, updates as Record<string, unknown>)
    const record = await findExactRecord(db, resource as any, id)
    return record ? transformRow(record as InferTableData<TResource>) : null
  }
  
  const onDelete = async (db: SolidDatabase, id: string): Promise<void> => {
    await deleteExactRecord(db, resource as any, id)
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
 * Helper to read the canonical collection key from a Pod ORM row.
 *
 * `row.id` is the base-relative resource id. Full RDF subject IRIs belong in
 * `ByIri` calls or `db.resolveRowIri`, not in collection identity.
 */
export function deriveRowId(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null

  return requireRowResourceId(row as { id?: string | null }, 'row')
}
