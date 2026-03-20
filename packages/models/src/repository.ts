import type {
  PodTable,
  PodColumn,
  InferTableData,
  InferInsertData,
  InferUpdateData,
  SolidDatabase as DrizzleSolidDatabase,
  QueryCondition,
} from '@undefineds.co/drizzle-solid'
import { and, like, or } from '@undefineds.co/drizzle-solid'

export type SolidDatabase<TSchema extends Record<string, unknown> = Record<string, never>> = DrizzleSolidDatabase<TSchema>

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

export function isIriLikeIdentifier(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(value) || value.startsWith('#')
}

export function stripEntityIdentifiers<T extends Record<string, unknown>>(data: T | null | undefined): Partial<T> {
  if (!data) return {}
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === '@id' || key === 'subject' || key === 'source') continue
    next[key] = value
  }
  return next as Partial<T>
}

type ExactTargetInput = string | Partial<Record<string, unknown>>

function resolveExactTarget(input: ExactTargetInput): { iri: string } | { locator: Record<string, unknown> } {
  if (typeof input === 'string') {
    return isIriLikeIdentifier(input) ? { iri: input } : { locator: { id: input } }
  }

  const iri = input['@id'] ?? input.subject
  if (typeof iri === 'string' && iri.length > 0) {
    return { iri }
  }

  return { locator: input as Record<string, unknown> }
}

export async function findExactRecord<TTable extends PodTable<any>>(
  db: SolidDatabase<any>,
  table: TTable,
  target: ExactTargetInput,
): Promise<InferTableData<TTable> | null> {
  const exact = resolveExactTarget(target)
  return 'iri' in exact
    ? await (db as any).findByIri(table as any, exact.iri)
    : await (db as any).findByLocator(table as any, exact.locator as any)
}

export async function updateExactRecord<TTable extends PodTable<any>>(
  db: SolidDatabase<any>,
  table: TTable,
  target: ExactTargetInput,
  data: Partial<Record<string, unknown>>,
): Promise<InferTableData<TTable> | null> {
  const exact = resolveExactTarget(target)
  const payload = stripEntityIdentifiers(data)
  return 'iri' in exact
    ? await (db as any).updateByIri(table as any, exact.iri, payload as any)
    : await (db as any).updateByLocator(table as any, exact.locator as any, payload as any)
}

export async function deleteExactRecord<TTable extends PodTable<any>>(
  db: SolidDatabase<any>,
  table: TTable,
  target: ExactTargetInput,
): Promise<boolean> {
  const exact = resolveExactTarget(target)
  return 'iri' in exact
    ? await (db as any).deleteByIri(table as any, exact.iri)
    : await (db as any).deleteByLocator(table as any, exact.locator as any)
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
    let query = db.select().from(table)
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
    const record = await findExactRecord(db, table, id)
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
        const result = await db.insert(table).values(inputWithId).execute()
        
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
        await updateExactRecord(db, table, id, input as Record<string, unknown>)
        const next = await detail(db, id)
        if (!next) {
          throw new Error(`Failed to load ${namespace} record after update`)
        }
        return next
      }

  const remove = options.disableMutations?.remove
    ? undefined
    : async (db: SolidDatabase, id: string): Promise<{ id: string }> => {
        await deleteExactRecord(db, table, id)
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
