import {
  agentResource,
  approvalResource,
  auditResource,
  chatResource,
  contactResource,
  credentialResource,
  aiModelResource,
  aiProviderResource,
  inboxNotificationResource,
  inputRequestResource,
  messageResource,
  settingsResource,
  threadResource,
  type SolidDatabase,
} from '@undefineds.co/models'

const CORE_RESOURCES = [
  chatResource,
  threadResource,
  messageResource,
  contactResource,
  agentResource,
  credentialResource,
  aiProviderResource,
  aiModelResource,
  settingsResource,
  approvalResource,
  auditResource,
  inboxNotificationResource,
  inputRequestResource,
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

  const init = (db as unknown as { init?: (resources: unknown[]) => Promise<void> }).init
  if (typeof init === 'function') {
    report(options, { stage: 'schema:init:start' })
    await init.call(db, [...CORE_RESOURCES])
    report(options, { stage: 'schema:init:done' })
  }
}

function report(options: InitializeLinxPodStorageOptions, event: PodStorageBootstrapEvent): void {
  options.onEvent?.(event)
}
