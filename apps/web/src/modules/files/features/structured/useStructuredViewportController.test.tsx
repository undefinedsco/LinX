import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MutableRefObject } from 'react'

import { useStructuredViewportController } from './useStructuredViewportController'

describe('useStructuredViewportController', () => {
  it('projects viewport chrome outside the preview renderer', () => {
    const { result } = renderHook(() => useStructuredViewportController({
      fileUri: 'https://pod.example/.data/tasks.ttl',
      viewMode: 'table',
    }))

    expect(result.current.chrome).toEqual({
      viewport: {
        ariaLabel: 'Structured resource viewport',
      },
    })
  })

  it('resets horizontal scroll when leaving table view', () => {
    const viewport = document.createElement('div')
    viewport.scrollLeft = 240
    const { result, rerender } = renderHook(
      ({ viewMode }) => useStructuredViewportController({
        fileUri: 'https://pod.example/.data/tasks.ttl',
        viewMode,
      }),
      { initialProps: { viewMode: 'table' as const } },
    )

    act(() => {
      ;(result.current.viewportRef as MutableRefObject<HTMLDivElement | null>).current = viewport
    })

    rerender({ viewMode: 'whiteboard' })

    expect(viewport.scrollLeft).toBe(0)
  })

  it('records viewport scroll top from scroll and capture events', () => {
    const viewport = document.createElement('div')
    const { result } = renderHook(() => useStructuredViewportController({
      fileUri: 'https://pod.example/.data/tasks.ttl',
      viewMode: 'table',
    }))

    act(() => {
      ;(result.current.viewportRef as MutableRefObject<HTMLDivElement | null>).current = viewport
      viewport.scrollTop = 120
      result.current.recordStructuredViewportScrollTop()
    })

    expect(result.current.lastScrollTopRef.current).toBe(120)

    act(() => {
      result.current.handleStructuredViewportScroll({
        currentTarget: { scrollTop: 360 },
      } as never)
    })

    expect(result.current.lastScrollTopRef.current).toBe(360)
  })
})
