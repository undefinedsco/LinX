import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActiveAppletRuntime } from './use-active-applet-runtime'

const mocks = vi.hoisted(() => ({
  activate: vi.fn().mockResolvedValue(undefined),
  deactivate: vi.fn().mockResolvedValue(undefined),
  database: { db: {} as object | null },
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => mocks.database,
}))

vi.mock('./applet-runtime', () => ({
  createAppletRuntimeCoordinator: () => ({
    activate: mocks.activate,
    deactivate: mocks.deactivate,
  }),
}))

vi.mock('./applet-runtime-registry', () => ({
  appletRuntimeRegistry: {},
}))

describe('useActiveAppletRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.database.db = {}
  })

  it('hands the active module and database identity to the runtime coordinator', async () => {
    const view = renderHook(({ moduleId }) => useActiveAppletRuntime(moduleId), {
      initialProps: { moduleId: 'chat' as const },
    })
    await act(async () => Promise.resolve())

    expect(mocks.activate).toHaveBeenLastCalledWith('chat', mocks.database.db)

    view.rerender({ moduleId: 'files' })
    await act(async () => Promise.resolve())

    expect(mocks.deactivate).toHaveBeenCalled()
    expect(mocks.activate).toHaveBeenLastCalledWith('files', mocks.database.db)
  })

  it('deactivates instead of activating without a database', async () => {
    mocks.database.db = null
    renderHook(() => useActiveAppletRuntime('settings'))
    await act(async () => Promise.resolve())

    expect(mocks.activate).not.toHaveBeenCalled()
    expect(mocks.deactivate).toHaveBeenCalledTimes(1)
  })
})
