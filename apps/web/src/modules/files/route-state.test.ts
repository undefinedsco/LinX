import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStructuredSubjectRoute,
  createFilesStructuredSubjectRouteState,
  pushStructuredSubjectRoute,
  structuredSubjectRouteFromBrowser,
  structuredSubjectRouteFromSearch,
  structuredSubjectRouteFromSearchObject,
  validateFilesRouteSearch,
  withStructuredSubjectRouteSearch,
} from './app/route-state'

const route = createFilesStructuredSubjectRouteState({
  documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
  subject: '../docs/report.md',
  targetUri: 'https://pod.example/.data/workspaces/docs/report.md',
  scrollTop: 184,
  rowIndex: 7,
  viewMode: 'whiteboard',
  classScope: 'udfs:Workspace',
  searchText: 'source card',
  sortKey: 'dcterms:title',
  sortDirection: 'desc',
  hiddenPredicates: ['udfs:tags', 'schema:about'],
  kanbanGroupPredicate: 'udfs:reviewStatus',
})

beforeEach(() => {
  window.history.replaceState({}, '', '/files?keep=1')
})

describe('files structured subject route state', () => {
  it('parses a structured subject route from URL search params', () => {
    const params = new URLSearchParams()
    params.set('filesRoute', 'linx.files.structuredSubjectRoute.v1')
    params.set('filesDocument', route.documentUri)
    params.set('filesSubject', route.subject)
    params.set('filesTarget', route.targetUri)
    params.set('filesScroll', String(route.scrollTop))
    params.set('filesRow', String(route.rowIndex))
    params.set('filesView', route.viewMode)
    params.set('filesClass', route.classScope ?? '')
    params.set('filesSearch', route.searchText)
    params.set('filesSort', route.sortKey ?? '')
    params.set('filesSortDirection', route.sortDirection)
    for (const predicate of route.hiddenPredicates) params.append('filesHidden', predicate)
    params.set('filesKanban', route.kanbanGroupPredicate ?? '')

    expect(structuredSubjectRouteFromSearch(`?${params.toString()}`)).toEqual(route)
  })

  it('ignores missing or incomplete route params', () => {
    expect(structuredSubjectRouteFromSearch('?filesDocument=https://pod.example/state.ttl')).toBeNull()
    expect(structuredSubjectRouteFromSearch('?filesRoute=linx.files.structuredSubjectRoute.v1&filesDocument=https://pod.example/state.ttl')).toBeNull()
  })

  it('normalizes invalid optional route values', () => {
    const parsed = structuredSubjectRouteFromSearch('?filesRoute=linx.files.structuredSubjectRoute.v1&filesDocument=https%3A%2F%2Fpod.example%2Fstate.ttl&filesSubject=%23A&filesTarget=https%3A%2F%2Fpod.example%2Ftarget.md&filesScroll=-12&filesRow=-4&filesView=graph&filesSortDirection=sideways')

    expect(parsed).toMatchObject({
      documentUri: 'https://pod.example/state.ttl',
      subject: '#A',
      targetUri: 'https://pod.example/target.md',
      scrollTop: 0,
      rowIndex: null,
      viewMode: 'table',
      sortDirection: 'asc',
    })
  })

  it('validates typed router search while preserving unrelated params', () => {
    expect(validateFilesRouteSearch({
      keep: '1',
      filesRoute: 'linx.files.structuredSubjectRoute.v1',
      filesDocument: route.documentUri,
      filesSubject: route.subject,
      filesTarget: route.targetUri,
      filesScroll: -2,
      filesRow: 7,
      filesView: 'graph',
      filesSortDirection: 'sideways',
      filesHidden: ['udfs:tags', 'schema:about', 42],
    })).toMatchObject({
      keep: '1',
      filesRoute: 'linx.files.structuredSubjectRoute.v1',
      filesDocument: route.documentUri,
      filesSubject: route.subject,
      filesTarget: route.targetUri,
      filesScroll: '0',
      filesRow: '7',
      filesView: 'table',
      filesSortDirection: 'asc',
      filesHidden: ['udfs:tags', 'schema:about'],
    })
  })

  it('drops malformed current route payloads from typed router search', () => {
    expect(validateFilesRouteSearch({
      keep: '1',
      filesRoute: 'linx.files.structuredSubjectRoute.v1',
      filesDocument: route.documentUri,
      filesScroll: '128',
      filesView: 'kanban',
      filesHidden: 'udfs:tags',
    })).toEqual({ keep: '1' })
  })

  it('drops legacy route payloads from typed router search', () => {
    expect(validateFilesRouteSearch({
      keep: '1',
      filesRoute: 'linx.files.structuredSubjectRoute.v0',
      filesDocument: route.documentUri,
      filesSubject: route.subject,
      filesTarget: route.targetUri,
      filesScroll: '128',
    })).toEqual({ keep: '1' })
  })

  it('canonicalizes a complete typed router route by dropping malformed optional values', () => {
    expect(validateFilesRouteSearch({
      keep: '1',
      filesRoute: 'linx.files.structuredSubjectRoute.v1',
      filesDocument: route.documentUri,
      filesSubject: route.subject,
      filesTarget: route.targetUri,
      filesScroll: -12,
      filesRow: -4,
      filesView: 'graph',
      filesClass: {},
      filesSearch: [],
      filesSort: false,
      filesSortDirection: 'sideways',
      filesHidden: [42],
      filesKanban: null,
    })).toEqual({
      keep: '1',
      filesRoute: 'linx.files.structuredSubjectRoute.v1',
      filesDocument: route.documentUri,
      filesSubject: route.subject,
      filesTarget: route.targetUri,
      filesScroll: '0',
      filesView: 'table',
      filesSortDirection: 'asc',
    })
  })

  it('round-trips a route with default optional state without leaking empty params', () => {
    const defaultRoute = createFilesStructuredSubjectRouteState({
      documentUri: 'https://pod.example/.data/state.ttl',
      subject: '#Report',
      targetUri: 'https://pod.example/public/report.md',
      scrollTop: 0,
      viewMode: 'table',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
    })

    const search = withStructuredSubjectRouteSearch({ keep: '1' }, defaultRoute)

    expect(search).toEqual({
      keep: '1',
      filesRoute: 'linx.files.structuredSubjectRoute.v1',
      filesDocument: defaultRoute.documentUri,
      filesSubject: defaultRoute.subject,
      filesTarget: defaultRoute.targetUri,
      filesScroll: '0',
      filesView: 'table',
      filesSortDirection: 'asc',
    })
    expect(structuredSubjectRouteFromSearchObject(search)).toEqual(defaultRoute)
  })

  it('round-trips structured subject route through a router search object', () => {
    const search = withStructuredSubjectRouteSearch({ keep: '1' }, route)

    expect(search.keep).toBe('1')
    expect(search.filesRoute).toBe('linx.files.structuredSubjectRoute.v1')
    expect(search.filesDocument).toBe(route.documentUri)
    expect(search.filesSubject).toBe(route.subject)
    expect(search.filesRow).toBe('7')
    expect(search.filesHidden).toEqual(route.hiddenPredicates)
    expect(structuredSubjectRouteFromSearchObject(search)).toEqual(route)

    expect(withStructuredSubjectRouteSearch(search, null)).toEqual({ keep: '1' })
  })

  it('pushes route state while preserving unrelated query params', () => {
    pushStructuredSubjectRoute(route)

    const params = new URLSearchParams(window.location.search)
    expect(params.get('keep')).toBe('1')
    expect(params.get('filesDocument')).toBe(route.documentUri)
    expect(params.get('filesSubject')).toBe(route.subject)
    expect(params.get('filesRow')).toBe('7')
    expect(params.getAll('filesHidden')).toEqual(route.hiddenPredicates)
    expect(structuredSubjectRouteFromBrowser()).toEqual(route)
  })

  it('clears only files route params and history state', () => {
    pushStructuredSubjectRoute(route)
    clearStructuredSubjectRoute()

    const params = new URLSearchParams(window.location.search)
    expect(params.get('keep')).toBe('1')
    expect(params.get('filesRoute')).toBeNull()
    expect(params.get('filesDocument')).toBeNull()
    expect(window.history.state?.linxFilesStructuredSubjectRoute).toBeUndefined()
  })
})
