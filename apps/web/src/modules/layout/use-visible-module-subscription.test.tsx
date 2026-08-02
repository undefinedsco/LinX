import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVisibleModuleSubscription } from './use-visible-module-subscription'

const usePodCollectionSubscriptionMock = vi.fn()
const db = {}

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db }),
}))

vi.mock('@/lib/data/use-pod-collection-subscription', () => ({
  usePodCollectionSubscription: (...args: unknown[]) => usePodCollectionSubscriptionMock(...args),
}))

describe('useVisibleModuleSubscription', () => {
  beforeEach(() => vi.clearAllMocks())

  it('binds a data subscription for active business modules', () => {
    const view = renderHook(({ moduleId }) => useVisibleModuleSubscription(moduleId), {
      initialProps: { moduleId: 'chat' as const },
    })
    expect(usePodCollectionSubscriptionMock).toHaveBeenLastCalledWith(true, db, expect.any(Function))

    view.rerender({ moduleId: 'files' })
    expect(usePodCollectionSubscriptionMock).toHaveBeenLastCalledWith(true, db, expect.any(Function))
    expect(usePodCollectionSubscriptionMock.mock.calls[0][2]).not.toBe(
      usePodCollectionSubscriptionMock.mock.calls[1][2],
    )
  })

  it('does not acquire a business subscription for settings', () => {
    renderHook(() => useVisibleModuleSubscription('settings'))
    expect(usePodCollectionSubscriptionMock).toHaveBeenCalledWith(false, db, expect.any(Function))
  })
})
