import type { SolidDatabase } from '@undefineds.co/models'

type NotificationActivity = { object?: string; type?: string }

export interface PodNotificationHandlers {
  onCreate?: (activity: NotificationActivity) => void | Promise<void>
  onUpdate?: (activity: NotificationActivity) => void | Promise<void>
  onDelete?: (activity: NotificationActivity) => void | Promise<void>
  onAdd?: (activity: NotificationActivity) => void | Promise<void>
  onRemove?: (activity: NotificationActivity) => void | Promise<void>
  onError?: (error: Error) => void
}

interface TopicEntry {
  handlers: Set<PodNotificationHandlers>
  subscription: { unsubscribe(): void } | null
  connecting: Promise<void> | null
}

const managers = new WeakMap<object, PodNotificationManager>()

export class PodNotificationManager {
  private readonly topics = new Map<object, TopicEntry>()

  constructor(
    private readonly db: SolidDatabase<any>,
    private readonly maxChannels = 12,
  ) {}

  async register(resource: object, handlers: PodNotificationHandlers): Promise<() => void> {
    let entry = this.topics.get(resource)
    if (!entry) {
      if (this.topics.size >= this.maxChannels) {
        throw new Error(`Pod notification channel budget exceeded (${this.maxChannels}).`)
      }
      entry = { handlers: new Set(), subscription: null, connecting: null }
      this.topics.set(resource, entry)
    }

    entry.handlers.add(handlers)
    if (!entry.subscription && !entry.connecting) {
      entry.connecting = this.connect(resource, entry).finally(() => {
        if (entry) entry.connecting = null
      })
    }

    try {
      await entry.connecting
    } catch (error) {
      entry.handlers.delete(handlers)
      if (entry.handlers.size === 0) this.topics.delete(resource)
      throw error
    }

    let active = true
    return () => {
      if (!active) return
      active = false
      const current = this.topics.get(resource)
      if (!current) return
      current.handlers.delete(handlers)
      if (current.handlers.size > 0) return
      current.subscription?.unsubscribe()
      this.topics.delete(resource)
    }
  }

  get activeChannelCount(): number {
    return this.topics.size
  }

  disconnect(): void {
    for (const entry of this.topics.values()) entry.subscription?.unsubscribe()
    this.topics.clear()
  }

  private async connect(resource: object, entry: TopicEntry): Promise<void> {
    const subscribe = (this.db as any).subscribe
    if (typeof subscribe !== 'function') throw new Error('Database notification subscription is unavailable.')

    entry.subscription = await subscribe.call(this.db, resource, {
      onCreate: (activity: NotificationActivity) => this.dispatch(entry, 'onCreate', activity),
      onUpdate: (activity: NotificationActivity) => this.dispatch(entry, 'onUpdate', activity),
      onDelete: (activity: NotificationActivity) => this.dispatch(entry, 'onDelete', activity),
      onAdd: (activity: NotificationActivity) => this.dispatch(entry, 'onAdd', activity),
      onRemove: (activity: NotificationActivity) => this.dispatch(entry, 'onRemove', activity),
      onError: (error: Error) => {
        for (const handlers of entry.handlers) handlers.onError?.(error)
      },
    })
  }

  private dispatch(
    entry: TopicEntry,
    type: Exclude<keyof PodNotificationHandlers, 'onError'>,
    activity: NotificationActivity,
  ): void {
    for (const handlers of entry.handlers) void handlers[type]?.(activity)
  }
}

export function getPodNotificationManager(db: SolidDatabase<any>): PodNotificationManager {
  const key = db as object
  let manager = managers.get(key)
  if (!manager) {
    manager = new PodNotificationManager(db)
    managers.set(key, manager)
  }
  return manager
}
