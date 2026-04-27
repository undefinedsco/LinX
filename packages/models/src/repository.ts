import type {
  PodTable,
  PodColumn,
  InferTableData,
  InferInsertData,
  InferUpdateData,
  QueryCondition,
} from '@undefineds.co/drizzle-solid'
import { and, like, or } from '@undefineds.co/drizzle-solid'

export interface AnyPodTable {
  resolveUri?: (id: string) => string
  config?: { name?: string; base?: string }
  getResourcePath?: () => string
}

export interface PodExecutableQuery<TRow = unknown> {
  where(condition: unknown): PodExecutableQuery<TRow>
  whereByIri?(iri: string | string[]): PodExecutableQuery<TRow>
  orderBy(...args: unknown[]): PodExecutableQuery<TRow>
  execute(): Promise<TRow[]>
}

export interface PodInsertQuery {
  values(values: unknown): { execute(): Promise<unknown[]> }
}

export interface PodUpdateQuery {
  set(values: unknown): PodMutationQuery
}

export interface PodMutationQuery {
  where(condition: unknown): PodMutationQuery
  whereByIri?(iri: string): PodMutationQuery
  execute(): Promise<unknown[]>
}

export interface SolidDatabase<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  init?(tables: AnyPodTable[] | AnyPodTable, ...rest: unknown[]): Promise<void>
  select(fields?: unknown): { from(table: AnyPodTable): PodExecutableQuery }
  insert(table: AnyPodTable): PodInsertQuery
  update(table: AnyPodTable): PodUpdateQuery
  delete(table: AnyPodTable): PodMutationQuery
  findByIri?<T = unknown>(table: AnyPodTable, iri: string): Promise<T | null>
  updateByIri?<T = unknown>(table: AnyPodTable, iri: string, data: Record<string, unknown>): Promise<T | null>
  deleteByIri?(table: AnyPodTable, iri: string): Promise<unknown>
  subscribe?(table: AnyPodTable, options: unknown): Promise<{ unsubscribe?: () => void } | (() => void)>
}

export async function initSolidTables(
  db: SolidDatabase,
  tables: AnyPodTable[],
): Promise<void> {
  await db.init?.(tables)
}

export function resolvePodUri(
  webId: string,
  table: { resolveUri?: (id: string) => string },
  id: string,
): string {
  const relativeUri = typeof table.resolveUri === 'function' ? table.resolveUri(id) : id
  if (/^https?:\/\//.test(relativeUri)) {
    return relativeUri
  }

  return new URL(relativeUri.replace(/^\//, ''), `${resolvePodBaseUrl(webId)}/`).toString()
}

export async function findPodRowByStorageId<T>(
  db: SolidDatabase,
  webId: string,
  table: AnyPodTable,
  id: string,
): Promise<T | null> {
  if (typeof (db as unknown as { findByIri?: unknown }).findByIri === 'function') {
    return await (db.findByIri as (table: AnyPodTable, iri: string) => Promise<T | null>)(
      table,
      resolvePodUri(webId, table, id),
    )
  }

  const rows = await (db.select().from as (table: AnyPodTable) => { execute(): Promise<unknown[]> })(table).execute()
  return rows.find((row) => (row as Record<string, unknown>)?.id === id) as T | undefined ?? null
}

export function whereByPodStorageId<TTable extends AnyPodTable>(
  webId: string,
  table: TTable,
  query: PodMutationQuery,
  id: string,
): PodMutationQuery {
  if (typeof query.whereByIri === 'function') {
    return query.whereByIri(resolvePodUri(webId, table, id))
  }

  return query.where({ id })
}

function resolvePodBaseUrl(webId: string): string {
  try {
    const target = new URL(webId)
    const pathParts = target.pathname.split('/').filter(Boolean)
    const ownerSegment = pathParts[0] ?? ''
    return `${target.origin}/${ownerSegment}`.replace(/\/+$/, '')
  } catch {
    return webId.replace('/profile/card#me', '').replace(/\/$/, '')
  }
}

export interface RepositoryCacheOptions {
  staleTime?: number
  gcTime?: number
}

export type RepositoryScope = 'list' | 'detail' | string

export interface RepositoryInvalidations {
  create?: RepositoryScope[]
  update?: RepositoryScope[]
  remove?: RepositoryScope[]
}

export interface RepositoryFilterContext<TTable extends PodTable<any>, Filters> {
  table: TTable
  filters?: Filters
}

export interface PodRepositoryDescriptor<
  TTable extends PodTable<any>,
  Row extends Record<string, unknown> = InferTableData<TTable>,
  Insert = InferInsertData<TTable>,
  Update = InferUpdateData<TTable>,
  Filters extends Record<string, unknown> = Record<string, unknown>
> {
  namespace: string
  resourcePath: string
  searchableFields?: (keyof Row & string)[]
  defaultSort?: { field: keyof Row & string; direction: 'asc' | 'desc' }
  cache?: RepositoryCacheOptions
  invalidations: RepositoryInvalidations
  list: (db: SolidDatabase, filters?: Filters) => Promise<Row[]>
  detail: (db: SolidDatabase, id: string) => Promise<Row | null>
  create?: (db: SolidDatabase, input: Insert) => Promise<Row>
  update?: (db: SolidDatabase, id: string, input: Update) => Promise<Row>
  remove?: (db: SolidDatabase, id: string) => Promise<{ id: string }>
}

export interface PodRepositoryOptions<
  TTable extends PodTable<any>,
  Row extends Record<string, unknown> = InferTableData<TTable>,
  Filters extends Record<string, unknown> = Record<string, unknown>
> {
  namespace: string
  table: TTable
  searchableFields?: (keyof Row & string)[]
  searchAccessor?: (filters?: Filters) => string | undefined
  defaultSort?: { field: keyof Row & string; direction: 'asc' | 'desc' }
  cache?: RepositoryCacheOptions
  invalidations?: Partial<RepositoryInvalidations>
  transform?: (row: Row) => Row
  filter?: (context: RepositoryFilterContext<TTable, Filters>) => QueryCondition | undefined
  disableMutations?: Partial<Record<'create' | 'update' | 'remove', boolean>>
}

export function resolveRowId(row: Partial<Record<string, unknown>> | null): string | null {
  if (!row) return null
  // Try @id first (standard RDF format)
  const subject = row['@id'] ?? row.subject
  if (typeof subject === 'string' && subject.length > 0) return subject
  // Try id field
  const id = row.id
  if (typeof id === 'string' && id.length > 0) return id
  // Handle drizzle-solid insert result format: {success: true, source: 'http://...'}
  const source = row.source
  if (typeof source === 'string' && source.length > 0) return source
  return null
}

export function createRepositoryDescriptor<
  TTable extends PodTable<any>,
  Row extends Record<string, unknown> = InferTableData<TTable>,
  Insert = InferInsertData<TTable>,
  Update = InferUpdateData<TTable>,
  Filters extends Record<string, unknown> = Record<string, unknown>
>(options: PodRepositoryOptions<TTable, Row, Filters>): PodRepositoryDescriptor<TTable, Row, Insert, Update, Filters> {
  const {
    namespace,
    table,
    searchableFields,
    defaultSort,
    cache,
  } = options

  const searchAccessor = options.searchAccessor ?? ((filters?: Filters) => {
    const value = filters ? (filters as Record<string, unknown>).search : undefined
    return typeof value === 'string' ? value : undefined
  })
  const transformRow = options.transform ?? ((row: Row) => row)

  const invalidations: RepositoryInvalidations = {
    create: options.invalidations?.create ?? ['list'],
    update: options.invalidations?.update ?? ['list', 'detail'],
    remove: options.invalidations?.remove ?? ['list', 'detail'],
  }

  const resolveColumn = (field: keyof Row & string): PodColumn | string => {
    const column = (table as unknown as Record<string, PodColumn | undefined>)[field]
    if (column) return column
    const tableName = (table as { config?: { name?: string } }).config?.name
    return tableName ? `${tableName}.${field}` : field
  }

  const buildWhereClause = (filters?: Filters): QueryCondition | undefined => {
    const clauses: QueryCondition[] = []
    const term = searchAccessor(filters)?.trim()
    if (term && searchableFields?.length) {
      const pattern = `%${term}%`
      const searchClauses = searchableFields
        .map((field) => like(resolveColumn(field), pattern))
      if (searchClauses.length === 1) {
        clauses.push(searchClauses[0])
      } else if (searchClauses.length > 1) {
        clauses.push(or(...searchClauses))
      }
    }
    const customFilter = options.filter?.({ table, filters })
    if (customFilter) {
      clauses.push(customFilter)
    }
    if (clauses.length === 0) return undefined
    return clauses.length === 1 ? clauses[0] : and(...clauses)
  }

  const list = async (db: SolidDatabase, filters?: Filters): Promise<Row[]> => {
    let query = db.select().from(table as unknown as AnyPodTable)
    const whereClause = buildWhereClause(filters)
    if (whereClause) {
      query = query.where(whereClause)
    }
    if (defaultSort) {
      query = query.orderBy(resolveColumn(defaultSort.field), defaultSort.direction)
    }
    const rows = await query.execute()
    return rows.map((row) => transformRow(row as Row))
  }

  const detail = async (db: SolidDatabase, id: string): Promise<Row | null> => {
    const record = typeof db.findByIri === 'function'
      ? await db.findByIri<Row>(table as unknown as AnyPodTable, id)
      : null
    return record ? transformRow(record as Row) : null
  }

  const create = options.disableMutations?.create
    ? undefined
    : async (db: SolidDatabase, input: Insert): Promise<Row> => {
        // Generate an ID if not provided
        const inputId = (input as Record<string, unknown>).id
        const generatedId = typeof inputId === 'string' && inputId.length > 0 
          ? inputId 
          : crypto.randomUUID()
        
        const inputWithId = { ...input, id: generatedId } as InferInsertData<TTable>
        const result = await db.insert(table as unknown as AnyPodTable).values(inputWithId).execute()
        
        // drizzle-solid returns [{success, source}] or the created row
        const firstResult = Array.isArray(result) ? result?.[0] : result
        
        // If result is actual row data (not drizzle-solid success format), return it
        if (firstResult && typeof firstResult === 'object' && !('success' in firstResult)) {
          return transformRow(firstResult as Row)
        }
        
        // Handle drizzle-solid format: {success: true, source: "http://..."}
        const sourceUrl = firstResult && typeof firstResult === 'object' && 'source' in firstResult
          ? (firstResult as { source: string }).source
          : null
        
        // Return synthetic row immediately for optimistic update
        // The real data will be fetched via invalidateQueries
        const baseUrl = sourceUrl ? sourceUrl.replace(/\/[^/]+\.ttl$/, '') : ''
        const syntheticId = sourceUrl 
          ? `${baseUrl}/${generatedId}.ttl`
          : generatedId
        
        return { 
          ...inputWithId, 
          id: generatedId,
          '@id': syntheticId,
          subject: syntheticId,
          source: sourceUrl,
        } as unknown as Row
      }

  const update = options.disableMutations?.update
    ? undefined
    : async (db: SolidDatabase, id: string, input: Update): Promise<Row> => {
        const query = db
          .update(table as unknown as AnyPodTable)
          .set(input as InferUpdateData<TTable>)
        const scopedQuery = typeof (query as unknown as { whereByIri?: (iri: string) => typeof query }).whereByIri === 'function'
          ? (query as unknown as { whereByIri: (iri: string) => typeof query }).whereByIri(id)
          : query.where({ '@id': id } as unknown as QueryCondition)
        await scopedQuery.execute()
        const next = await detail(db, id)
        if (!next) {
          throw new Error(`Failed to load ${namespace} record after update`)
        }
        return next
      }

  const remove = options.disableMutations?.remove
    ? undefined
    : async (db: SolidDatabase, id: string): Promise<{ id: string }> => {
        const query = db.delete(table as unknown as AnyPodTable)
        const scopedQuery = typeof (query as unknown as { whereByIri?: (iri: string) => typeof query }).whereByIri === 'function'
          ? (query as unknown as { whereByIri: (iri: string) => typeof query }).whereByIri(id)
          : query.where({ '@id': id } as unknown as QueryCondition)
        await scopedQuery.execute()
        return { id }
      }

  const resourcePath =
    typeof (table as { getResourcePath?: () => string }).getResourcePath === 'function'
      ? (table as { getResourcePath: () => string }).getResourcePath()
      : ((table as { config?: { base?: string } }).config?.base ?? '')

  return {
    namespace,
    resourcePath,
    searchableFields,
    defaultSort,
    cache,
    invalidations,
    list,
    detail,
    create,
    update,
    remove,
  }
}

export const definePodRepository = createRepositoryDescriptor
