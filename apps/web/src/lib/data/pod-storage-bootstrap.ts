import {
  agentTable,
  approvalResource,
  auditResource,
  chatTable,
  contactTable,
  credentialResource,
  aiModelResource,
  aiProviderResource,
  inboxNotificationTable,
  messageTable,
  settingsTable,
  threadTable,
  type SolidDatabase,
} from '@undefineds.co/models'

const CORE_TABLES = [
  chatTable,
  threadTable,
  messageTable,
  contactTable,
  agentTable,
  credentialResource,
  aiProviderResource,
  aiModelResource,
  settingsTable,
  approvalResource,
  auditResource,
  inboxNotificationTable,
] as const

export interface PodStorageBootstrapEvent {
  stage: string
  target?: string
  status?: number
  error?: string
}

export interface InitializeLinxPodStorageOptions {
  onEvent?: (event: PodStorageBootstrapEvent) => void
}

export async function initializeLinxPodStorage(
  db: SolidDatabase,
  options: InitializeLinxPodStorageOptions = {},
): Promise<void> {
  const connect = (db as unknown as { connect?: () => Promise<void> }).connect
  if (typeof connect === 'function') {
    report(options, { stage: 'connect:start' })
    await connect.call(db)
    report(options, { stage: 'connect:done' })
  }

  const init = (db as unknown as { init?: (tables: unknown[]) => Promise<void> }).init
  if (typeof init === 'function') {
    report(options, { stage: 'schema:init:start' })
    await init.call(db, [...CORE_TABLES])
    report(options, { stage: 'schema:init:done' })
  }
}

function report(options: InitializeLinxPodStorageOptions, event: PodStorageBootstrapEvent): void {
  options.onEvent?.(event)
}
