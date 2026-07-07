import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useResourceSidecarActionsController } from './useResourceSidecarActionsController'

describe('useResourceSidecarActionsController', () => {
  it('projects the owner sidecars and owns the access dialog state for action buttons', () => {
    const file = {
      uri: 'https://pod.example/files/report.md.meta',
      kind: 'resource',
      semanticKind: 'meta-sidecar',
    } as const

    const { result } = renderHook(() => useResourceSidecarActionsController(file))

    expect(result.current.accessOpen).toBe(false)
    expect(result.current.ownerTarget).toEqual({
      uri: 'https://pod.example/files/report.md',
      kind: 'resource',
    })
    expect(result.current.sidecars).toMatchObject({
      ownerUri: 'https://pod.example/files/report.md',
      metaUri: 'https://pod.example/files/report.md.meta',
      accessPolicyUris: {
        acr: 'https://pod.example/files/report.md.acr',
        acl: 'https://pod.example/files/report.md.acl',
      },
    })

    act(() => result.current.openAccessDialog())
    expect(result.current.accessOpen).toBe(true)

    act(() => result.current.closeAccessDialog())
    expect(result.current.accessOpen).toBe(false)
  })
})
