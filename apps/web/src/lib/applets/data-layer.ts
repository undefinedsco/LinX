import { create } from 'zustand'
import type { PodRepositoryDescriptor } from '@undefineds.co/models'
import { requireRowResourceId } from '@/lib/data/resource-identity'
import { createRepositoryQueries } from '@/lib/data/query-factory'
import type {
  DetailConfig,
  DetailViewStateBase,
  ListConfig,
  AppletDataLayer,
  AppletStore,
  AppletStoreState,
} from '@/lib/data/types'
import type { AppletId } from '@/modules/layout/applet-registry'

const dataLayers = new Map<AppletId, AppletDataLayer<any, any, any, any, any, any>>()

export const registerDataLayer = <
  Row extends Record<string, unknown>,
  DetailState extends DetailViewStateBase,
  ViewModel = Row,
  Insert = Row,
  Update = Insert,
  Filters extends Record<string, unknown> = Record<string, unknown>
>(layer: AppletDataLayer<Row, DetailState, ViewModel, Insert, Update, Filters>) => {
  dataLayers.set(layer.id, layer)
}

export const getDataLayer = (id: AppletId) => dataLayers.get(id)

export interface CreateDataLayerOptions<
  Row extends Record<string, unknown>,
  DetailState extends DetailViewStateBase,
  ViewModel = Row,
  Insert = Row,
  Update = Insert,
  Filters extends Record<string, unknown> = Record<string, unknown>
> {
  id: AppletId
  descriptor: PodRepositoryDescriptor<any, Row, Insert, Update, Filters>
  listConfig: ListConfig<Row>
  detailConfig: DetailConfig<DetailState>
  mapRow?: (row: Row) => ViewModel
  getRowId?: (view: ViewModel, source?: Row) => string | null | undefined
}

const deriveIdentifier = <RowSource>(view: RowSource): string | undefined => {
  return requireRowResourceId(view as { id?: string | null }, 'applet row')
}

export function createDataLayer<
  Row extends Record<string, unknown>,
  DetailState extends DetailViewStateBase,
  ViewModel = Row,
  Insert = Row,
  Update = Insert,
  Filters extends Record<string, unknown> = Record<string, unknown>
>(options: CreateDataLayerOptions<Row, DetailState, ViewModel, Insert, Update, Filters>) {
  const { descriptor, id, detailConfig } = options
  const mapRow = options.mapRow ?? ((row: Row) => row as unknown as ViewModel)

  const queries = createRepositoryQueries<Row, Insert, Update, Filters>(descriptor)

  const buildDetailState = () => detailConfig.initialViewState()

  const useStore = create<AppletStoreState<ViewModel, DetailState>>(() => ({
    entities: {},
    ids: [],
    search: '',
    selectedId: null,
    detailView: buildDetailState(),
  }))

  const getIdentifierFor = (view: ViewModel, source?: Row): string => {
    const custom = options.getRowId?.(view, source)
    if (custom) return custom
    const fromSource = source ? deriveIdentifier<Row>(source) : undefined
    if (fromSource) return fromSource
    const fallback = deriveIdentifier(view)
    if (fallback) return fallback
    throw new Error(`Unable to derive identifier for applet ${id}`)
  }

  const store: AppletStore<ViewModel, DetailState> = {
    useStore,
    actions: {
      setSearch: (value: string) => useStore.setState({ search: value }),
      select: (selectedId: string | null) =>
        useStore.setState(() => {
          const baseState = buildDetailState()
          return {
            selectedId,
            detailView: selectedId ? baseState : { ...baseState, mode: 'create' },
          }
        }),
      setDetailView: (partial: Partial<DetailState>) =>
        useStore.setState((state) => ({ detailView: { ...state.detailView, ...partial } })),
      startCreate: () => {
        const baseState = buildDetailState()
        useStore.setState({
          selectedId: null,
          detailView: { ...baseState, mode: 'create' },
        })
      },
    },
  }

  const normalizedListConfig: ListConfig<Row> = {
    ...options.listConfig,
    searchable: options.listConfig.searchable ?? Boolean(descriptor.searchableFields?.length),
    searchFields: options.listConfig.searchFields ?? descriptor.searchableFields,
  }

  const hydrateList = (rows?: Row[] | null): ViewModel[] => {
    if (!rows) return []
    const viewModels = rows.map((row) => mapRow(row))
    useStore.setState((state) => {
      const entities = { ...state.entities }
      const ids: string[] = []
      viewModels.forEach((view, index) => {
        const identifier = getIdentifierFor(view, rows[index])
        entities[identifier] = view
        ids.push(identifier)
      })
      return {
        ...state,
        entities,
        ids,
      }
    })
    return viewModels
  }

  const hydrateDetail = (row?: Row | null): ViewModel | undefined => {
    if (!row) return undefined
    const viewModel = mapRow(row)
    const identifier = getIdentifierFor(viewModel, row)
    useStore.setState((state) => ({
      ...state,
      entities: { ...state.entities, [identifier]: viewModel },
    }))
    return viewModel
  }

  const layer: AppletDataLayer<Row, DetailState, ViewModel, Insert, Update, Filters> = {
    id,
    listConfig: normalizedListConfig,
    detailConfig,
    queries,
    store,
    hydrateList,
    hydrateDetail,
  }

  registerDataLayer(layer)
  return layer
}
