import type {
  StructuredResourceViewMode,
  StructuredSortDirection,
} from '../domain/structured/structured-view-metadata'

const FILES_ROUTE_MARKER = 'linx.files.structuredSubjectRoute.v1'

export interface FilesStructuredSubjectRouteState {
  documentUri: string
  subject: string
  scrollTop: number
  rowIndex?: number | null
  viewMode: StructuredResourceViewMode
  classScope: string | null
  searchText: string
  sortKey: string | null
  sortDirection: StructuredSortDirection
  hiddenPredicates: string[]
  kanbanGroupPredicate: string | null
  targetUri: string
}

type BrowserHistoryState = {
  linxFilesStructuredSubjectRoute?: FilesStructuredSubjectRouteState
} | null

export type FilesRouteSearch = Record<string, unknown> & {
  filesRoute?: string
  filesDocument?: string
  filesSubject?: string
  filesTarget?: string
  filesScroll?: string
  filesRow?: string
  filesView?: StructuredResourceViewMode
  filesClass?: string
  filesSearch?: string
  filesSort?: string
  filesSortDirection?: StructuredSortDirection
  filesHidden?: string | string[]
  filesKanban?: string
}

export interface FilesRouteBridge {
  search: FilesRouteSearch
  pushStructuredSubjectRoute: (route: FilesStructuredSubjectRouteState) => void
  clearStructuredSubjectRoute: () => void
}

const PARAMS = {
  marker: 'filesRoute',
  documentUri: 'filesDocument',
  subject: 'filesSubject',
  targetUri: 'filesTarget',
  scrollTop: 'filesScroll',
  rowIndex: 'filesRow',
  viewMode: 'filesView',
  classScope: 'filesClass',
  searchText: 'filesSearch',
  sortKey: 'filesSort',
  sortDirection: 'filesSortDirection',
  hiddenPredicates: 'filesHidden',
  kanbanGroupPredicate: 'filesKanban',
} as const

function normalizeViewMode(value: string | null): StructuredResourceViewMode {
  return value === 'kanban' || value === 'whiteboard' || value === 'raw' ? value : 'table'
}

function normalizeSortDirection(value: string | null): StructuredSortDirection {
  return value === 'desc' ? 'desc' : 'asc'
}

function normalizeScrollTop(value: string | null): number {
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function normalizeRowIndex(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null
}

function searchStringValue(search: Record<string, unknown>, key: string): string | null {
  const value = search[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string') ?? null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function searchStringValues(search: Record<string, unknown>, key: string): string[] {
  const value = search[key]
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return []
}

function hasFilesRouteParam(search: Record<string, unknown>): boolean {
  return Object.values(PARAMS).some((key) => key in search)
}

export function validateFilesRouteSearch(search: Record<string, unknown>): FilesRouteSearch {
  const next = withStructuredSubjectRouteSearch(search, null)
  if (searchStringValue(search, PARAMS.marker) !== FILES_ROUTE_MARKER) {
    return hasFilesRouteParam(search) ? next : { ...search }
  }

  const documentUri = searchStringValue(search, PARAMS.documentUri)
  const subject = searchStringValue(search, PARAMS.subject)
  const targetUri = searchStringValue(search, PARAMS.targetUri)
  if (!documentUri || !subject || !targetUri) return next

  next.filesRoute = FILES_ROUTE_MARKER
  next.filesDocument = documentUri
  next.filesSubject = subject
  next.filesTarget = targetUri
  next.filesScroll = String(normalizeScrollTop(searchStringValue(search, PARAMS.scrollTop)))
  const rowIndex = normalizeRowIndex(searchStringValue(search, PARAMS.rowIndex))
  if (rowIndex !== null) next.filesRow = String(rowIndex)
  next.filesView = normalizeViewMode(searchStringValue(search, PARAMS.viewMode))
  const classScope = searchStringValue(search, PARAMS.classScope)
  if (classScope) next.filesClass = classScope
  const searchText = searchStringValue(search, PARAMS.searchText)
  if (searchText) next.filesSearch = searchText
  const sortKey = searchStringValue(search, PARAMS.sortKey)
  if (sortKey) next.filesSort = sortKey
  next.filesSortDirection = normalizeSortDirection(searchStringValue(search, PARAMS.sortDirection))
  const hiddenPredicates = searchStringValues(search, PARAMS.hiddenPredicates)
  if (hiddenPredicates.length === 1) next.filesHidden = hiddenPredicates[0]
  if (hiddenPredicates.length > 1) next.filesHidden = hiddenPredicates
  const kanbanGroupPredicate = searchStringValue(search, PARAMS.kanbanGroupPredicate)
  if (kanbanGroupPredicate) next.filesKanban = kanbanGroupPredicate
  return next
}

export function createFilesStructuredSubjectRouteState(input: {
  documentUri: string
  subject: string
  targetUri: string
  scrollTop: number
  rowIndex?: number | null
  viewMode: StructuredResourceViewMode
  classScope: string | null
  searchText: string
  sortKey: string | null
  sortDirection: StructuredSortDirection
  hiddenPredicates: string[]
  kanbanGroupPredicate: string | null
}): FilesStructuredSubjectRouteState {
  return {
    documentUri: input.documentUri,
    subject: input.subject,
    targetUri: input.targetUri,
    scrollTop: Math.max(0, Math.round(input.scrollTop)),
    rowIndex: normalizeRowIndex(input.rowIndex),
    viewMode: input.viewMode,
    classScope: input.classScope,
    searchText: input.searchText,
    sortKey: input.sortKey,
    sortDirection: input.sortDirection,
    hiddenPredicates: input.hiddenPredicates,
    kanbanGroupPredicate: input.kanbanGroupPredicate,
  }
}

export function structuredSubjectRouteFromSearch(search: string): FilesStructuredSubjectRouteState | null {
  const params = new URLSearchParams(search)
  if (params.get(PARAMS.marker) !== FILES_ROUTE_MARKER) return null
  const documentUri = params.get(PARAMS.documentUri)
  const subject = params.get(PARAMS.subject)
  const targetUri = params.get(PARAMS.targetUri)
  if (!documentUri || !subject || !targetUri) return null
  return createFilesStructuredSubjectRouteState({
    documentUri,
    subject,
    targetUri,
    scrollTop: normalizeScrollTop(params.get(PARAMS.scrollTop)),
    rowIndex: normalizeRowIndex(params.get(PARAMS.rowIndex)),
    viewMode: normalizeViewMode(params.get(PARAMS.viewMode)),
    classScope: params.get(PARAMS.classScope),
    searchText: params.get(PARAMS.searchText) ?? '',
    sortKey: params.get(PARAMS.sortKey),
    sortDirection: normalizeSortDirection(params.get(PARAMS.sortDirection)),
    hiddenPredicates: params.getAll(PARAMS.hiddenPredicates),
    kanbanGroupPredicate: params.get(PARAMS.kanbanGroupPredicate),
  })
}

export function structuredSubjectRouteFromSearchObject(search: Record<string, unknown>): FilesStructuredSubjectRouteState | null {
  if (searchStringValue(search, PARAMS.marker) !== FILES_ROUTE_MARKER) return null
  const documentUri = searchStringValue(search, PARAMS.documentUri)
  const subject = searchStringValue(search, PARAMS.subject)
  const targetUri = searchStringValue(search, PARAMS.targetUri)
  if (!documentUri || !subject || !targetUri) return null
  return createFilesStructuredSubjectRouteState({
    documentUri,
    subject,
    targetUri,
    scrollTop: normalizeScrollTop(searchStringValue(search, PARAMS.scrollTop)),
    rowIndex: normalizeRowIndex(searchStringValue(search, PARAMS.rowIndex)),
    viewMode: normalizeViewMode(searchStringValue(search, PARAMS.viewMode)),
    classScope: searchStringValue(search, PARAMS.classScope),
    searchText: searchStringValue(search, PARAMS.searchText) ?? '',
    sortKey: searchStringValue(search, PARAMS.sortKey),
    sortDirection: normalizeSortDirection(searchStringValue(search, PARAMS.sortDirection)),
    hiddenPredicates: searchStringValues(search, PARAMS.hiddenPredicates),
    kanbanGroupPredicate: searchStringValue(search, PARAMS.kanbanGroupPredicate),
  })
}

export function structuredSubjectRouteFromBrowser(): FilesStructuredSubjectRouteState | null {
  if (typeof window === 'undefined') return null
  const fromSearch = structuredSubjectRouteFromSearch(window.location.search)
  if (fromSearch) return fromSearch
  const historyState = window.history.state as BrowserHistoryState
  const fromHistory = historyState?.linxFilesStructuredSubjectRoute
  if (fromHistory) return fromHistory
  return null
}

function applyRouteParams(url: URL, route: FilesStructuredSubjectRouteState | null) {
  for (const key of Object.values(PARAMS)) url.searchParams.delete(key)
  if (!route) return
  url.searchParams.set(PARAMS.marker, FILES_ROUTE_MARKER)
  url.searchParams.set(PARAMS.documentUri, route.documentUri)
  url.searchParams.set(PARAMS.subject, route.subject)
  url.searchParams.set(PARAMS.targetUri, route.targetUri)
  url.searchParams.set(PARAMS.scrollTop, String(route.scrollTop))
  if (route.rowIndex !== null && route.rowIndex !== undefined) {
    url.searchParams.set(PARAMS.rowIndex, String(route.rowIndex))
  }
  url.searchParams.set(PARAMS.viewMode, route.viewMode)
  if (route.classScope) url.searchParams.set(PARAMS.classScope, route.classScope)
  if (route.searchText) url.searchParams.set(PARAMS.searchText, route.searchText)
  if (route.sortKey) url.searchParams.set(PARAMS.sortKey, route.sortKey)
  url.searchParams.set(PARAMS.sortDirection, route.sortDirection)
  for (const predicate of route.hiddenPredicates) {
    url.searchParams.append(PARAMS.hiddenPredicates, predicate)
  }
  if (route.kanbanGroupPredicate) url.searchParams.set(PARAMS.kanbanGroupPredicate, route.kanbanGroupPredicate)
}

export function withStructuredSubjectRouteSearch(
  currentSearch: Record<string, unknown>,
  route: FilesStructuredSubjectRouteState | null,
): FilesRouteSearch {
  const next: FilesRouteSearch = { ...currentSearch }
  for (const key of Object.values(PARAMS)) delete next[key]
  if (!route) return next

  next.filesRoute = FILES_ROUTE_MARKER
  next.filesDocument = route.documentUri
  next.filesSubject = route.subject
  next.filesTarget = route.targetUri
  next.filesScroll = String(route.scrollTop)
  if (route.rowIndex !== null && route.rowIndex !== undefined) next.filesRow = String(route.rowIndex)
  next.filesView = route.viewMode
  if (route.classScope) next.filesClass = route.classScope
  if (route.searchText) next.filesSearch = route.searchText
  if (route.sortKey) next.filesSort = route.sortKey
  next.filesSortDirection = route.sortDirection
  if (route.hiddenPredicates.length === 1) next.filesHidden = route.hiddenPredicates[0]
  if (route.hiddenPredicates.length > 1) next.filesHidden = route.hiddenPredicates
  if (route.kanbanGroupPredicate) next.filesKanban = route.kanbanGroupPredicate
  return next
}

export function pushStructuredSubjectRoute(route: FilesStructuredSubjectRouteState) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  applyRouteParams(url, route)
  window.history.pushState({
    ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
    linxFilesStructuredSubjectRoute: route,
  }, '', url)
}

export function clearStructuredSubjectRoute() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  applyRouteParams(url, null)
  const currentState = window.history.state && typeof window.history.state === 'object'
    ? { ...window.history.state }
    : {}
  delete currentState.linxFilesStructuredSubjectRoute
  window.history.replaceState(currentState, '', url)
}
