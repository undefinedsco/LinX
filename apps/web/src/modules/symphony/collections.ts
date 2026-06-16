import {
  deliveryResource,
  evidenceResource,
  issueResource,
  reportResource,
  runResource,
  runStepResource,
  sessionResource,
  taskResource,
  type DeliveryInsert,
  type DeliveryRow,
  type EvidenceInsert,
  type EvidenceRow,
  type IssueInsert,
  type IssueRow,
  type ReportInsert,
  type ReportRow,
  type RunInsert,
  type RunRow,
  type RunStepInsert,
  type RunStepRow,
  type SessionInsert,
  type SessionRow,
  type SolidDatabase,
  type TaskInsert,
  type TaskRow,
} from '@undefineds.co/models'
import { createPodCollection } from '@/lib/data/pod-collection'
import { queryClient } from '@/providers/query-provider'

let dbGetter: (() => SolidDatabase | null) | null = null

export function setSymphonyControlDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

export const symphonyIssueCollection = createPodCollection<typeof issueResource, IssueRow, IssueInsert>({
  resource: issueResource,
  queryKey: ['symphony', 'issues'],
  queryClient,
  getDb,
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Symphony Issue row is missing id.')
    return item.id
  },
})

export const symphonyTaskCollection = createPodCollection<typeof taskResource, TaskRow, TaskInsert>({
  resource: taskResource,
  queryKey: ['symphony', 'tasks'],
  queryClient,
  getDb,
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Symphony Task row is missing id.')
    return item.id
  },
})

export const symphonyDeliveryCollection = createPodCollection<typeof deliveryResource, DeliveryRow, DeliveryInsert>({
  resource: deliveryResource,
  queryKey: ['symphony', 'deliveries'],
  queryClient,
  getDb,
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Symphony Delivery row is missing id.')
    return item.id
  },
})

export const symphonySessionCollection = createPodCollection<typeof sessionResource, SessionRow, SessionInsert>({
  resource: sessionResource,
  queryKey: ['symphony', 'sessions'],
  queryClient,
  getDb,
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Symphony Session row is missing id.')
    return item.id
  },
})

export const symphonyRunCollection = createPodCollection<typeof runResource, RunRow, RunInsert>({
  resource: runResource,
  queryKey: ['symphony', 'runs'],
  queryClient,
  getDb,
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Symphony Run row is missing id.')
    return item.id
  },
})

export const symphonyRunStepCollection = createPodCollection<typeof runStepResource, RunStepRow, RunStepInsert>({
  resource: runStepResource,
  queryKey: ['symphony', 'runSteps'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Symphony RunStep row is missing id.')
    return item.id
  },
})

export const symphonyEvidenceCollection = createPodCollection<typeof evidenceResource, EvidenceRow, EvidenceInsert>({
  resource: evidenceResource,
  queryKey: ['symphony', 'evidence'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Symphony Evidence row is missing id.')
    return item.id
  },
})

export const symphonyReportCollection = createPodCollection<typeof reportResource, ReportRow, ReportInsert>({
  resource: reportResource,
  queryKey: ['symphony', 'reports'],
  queryClient,
  getDb,
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Symphony Report row is missing id.')
    return item.id
  },
})

const symphonyControlCollections = [
  symphonyIssueCollection,
  symphonyTaskCollection,
  symphonyDeliveryCollection,
  symphonySessionCollection,
  symphonyRunCollection,
  symphonyRunStepCollection,
  symphonyEvidenceCollection,
  symphonyReportCollection,
]

export function initializeSymphonyControlCollections(db: SolidDatabase | null) {
  setSymphonyControlDatabaseGetter(() => db)
}

export const symphonyControlOps = {
  async subscribeToPod(): Promise<() => void> {
    const db = getDb()
    if (!db) return () => undefined

    const unsubscribers = await Promise.all(
      symphonyControlCollections.map((collection) => collection.subscribeToPod(db)),
    )

    return () => {
      for (const unsubscribe of unsubscribers) {
        try {
          unsubscribe()
        } catch (error) {
          console.warn('[symphonyControlOps] Unsubscribe error:', error)
        }
      }
    }
  },

  async fetchSnapshot() {
    const [issues, tasks, deliveries, sessions, runs, runSteps, evidence, reports] = await Promise.all([
      symphonyIssueCollection.fetch(),
      symphonyTaskCollection.fetch(),
      symphonyDeliveryCollection.fetch(),
      symphonySessionCollection.fetch(),
      symphonyRunCollection.fetch(),
      symphonyRunStepCollection.fetch(),
      symphonyEvidenceCollection.fetch(),
      symphonyReportCollection.fetch(),
    ])

    return { issues, tasks, deliveries, sessions, runs, runSteps, evidence, reports }
  },
}
