import { describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/symphony/collections', () => ({ symphonyRunCollection: {} }))
vi.mock('@tanstack/react-db', () => ({ useLiveQuery: () => ({ data: [] }) }))

import { countRunningTasks } from './use-running-task-count'

describe('countRunningTasks', () => {
  it('counts runs that keep going after sign-out', () => {
    expect(countRunningTasks([
      { status: 'running' },
      { status: 'queued' },
      { status: 'waiting_input' },
      { status: 'completed' },
      { status: 'failed' },
      { status: 'cancelled' },
    ] as never)).toBe(3)
  })
})
