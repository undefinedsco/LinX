import { beforeEach, describe, expect, it } from 'vitest'
import { readStartupView, rememberLastMicroApp, resolveStartupMicroAppId, writeStartupView } from './startup'

const valid = (id: string) => ['chat', 'files'].includes(id)

describe('startup view', () => {
  beforeEach(() => {
    localStorage.removeItem('linx-startup-view')
    localStorage.removeItem('linx-last-micro-app')
  })

  it('opens the last place by default, and chat when chosen', () => {
    rememberLastMicroApp('files')
    expect(readStartupView()).toBe('last')
    expect(resolveStartupMicroAppId(valid)).toBe('files')
    writeStartupView('chat')
    expect(resolveStartupMicroAppId(valid)).toBeNull()
  })

  it('ignores a remembered place that no longer exists', () => {
    rememberLastMicroApp('gone')
    expect(resolveStartupMicroAppId(valid)).toBeNull()
  })
})
