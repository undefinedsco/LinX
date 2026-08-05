import { describe, expect, it, vi } from 'vitest'
import {
  createAppletRuntimeCoordinator,
  type AppletRuntime,
  type AppletRuntimeRegistry,
} from './applet-runtime'

function runtime(activate: AppletRuntime['activate']): AppletRuntime {
  return { activate }
}

describe('createAppletRuntimeCoordinator', () => {
  it('hands ownership from the previous module to the next module', async () => {
    const releaseChat = vi.fn()
    const releaseFiles = vi.fn()
    let chatSignal: AbortSignal | undefined
    const registry: AppletRuntimeRegistry = {
      chat: runtime(async ({ signal }) => {
        chatSignal = signal
        return releaseChat
      }),
      files: runtime(async () => releaseFiles),
    }
    const coordinator = createAppletRuntimeCoordinator(registry)
    const db = {}

    await coordinator.activate('chat', db)
    await coordinator.activate('files', db)

    expect(chatSignal?.aborted).toBe(true)
    expect(releaseChat).toHaveBeenCalledTimes(1)
    expect(releaseFiles).not.toHaveBeenCalled()
  })

  it('releases an activation that resolves after a handoff', async () => {
    let finishChat!: (release: () => void) => void
    const lateRelease = vi.fn()
    const registry: AppletRuntimeRegistry = {
      chat: runtime(() => new Promise((resolve) => {
        finishChat = resolve
      })),
      files: runtime(async () => () => undefined),
    }
    const coordinator = createAppletRuntimeCoordinator(registry)
    const db = {}

    const chatActivation = coordinator.activate('chat', db)
    await coordinator.activate('files', db)
    finishChat(lateRelease)
    await chatActivation

    expect(lateRelease).toHaveBeenCalledTimes(1)
  })

  it('does nothing for modules without a data runtime', async () => {
    const activate = vi.fn()
    const coordinator = createAppletRuntimeCoordinator({
      chat: runtime(activate),
    })

    await coordinator.activate('settings', {})

    expect(activate).not.toHaveBeenCalled()
  })

  it('treats a database identity change as a handoff', async () => {
    const releases = [vi.fn(), vi.fn()]
    const activate = vi.fn()
      .mockResolvedValueOnce(releases[0])
      .mockResolvedValueOnce(releases[1])
    const coordinator = createAppletRuntimeCoordinator({
      files: runtime(activate),
    })

    await coordinator.activate('files', {})
    await coordinator.activate('files', {})

    expect(activate).toHaveBeenCalledTimes(2)
    expect(releases[0]).toHaveBeenCalledTimes(1)
    expect(releases[1]).not.toHaveBeenCalled()
  })
})
