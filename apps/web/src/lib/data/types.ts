import type { MicroAppId } from '@/modules/layout/micro-app-registry'
import type { RepositoryQueries } from './query-factory'

export interface ListConfig<Row = unknown> {
  searchable?: boolean
  searchFields?: (keyof Row & string)[]
  initialSort?: { field: keyof Row & string; direction: 'asc' | 'desc' }
  pagination?: { type: 'offset' | 'cursor'; pageSize: number }
}

export interface DetailViewStateBase {
  mode: 'view' | 'create'
  message?: string
}

export interface DetailConfig<DetailState extends DetailViewStateBase> {
  initialViewState: () => DetailState
}

export interface MicroAppStore<RowView, DetailState extends DetailViewStateBase> {
  useStore: <Selector>(selector: (state: MicroAppStoreState<RowView, DetailState>) => Selector) => Selector
  actions: {
    setSearch: (value: string) => void
    select: (id: string | null) => void
    setDetailView: (partial: Partial<DetailState>) => void
    startCreate: () => void
  }
}

export interface MicroAppStoreState<RowView, DetailState extends DetailViewStateBase> {
  entities: Record<string, RowView>
  ids: string[]
  search: string
  selectedId: string | null
  detailView: DetailState
}

export interface MicroAppDataLayer<
  Row extends Record<string, unknown>,
  DetailState extends DetailViewStateBase,
  ViewModel = Row,
  Insert = Row,
  Update = Insert,
  Filters extends Record<string, unknown> = Record<string, unknown>
> {
  id: MicroAppId
  listConfig: ListConfig<Row>
  detailConfig: DetailConfig<DetailState>
  queries: RepositoryQueries<Row, Insert, Update, Filters>
  store: MicroAppStore<ViewModel, DetailState>
  hydrateList: (rows?: Row[] | null) => ViewModel[]
  hydrateDetail: (row?: Row | null) => ViewModel | undefined
}
