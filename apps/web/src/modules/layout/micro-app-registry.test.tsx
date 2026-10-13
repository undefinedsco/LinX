import { describe, expect, it } from 'vitest'
import { isValidMicroAppId, microAppIds, microAppRegistry } from './micro-app-registry'

describe('microAppRegistry', () => {
  it('lets Files configure only the shared list panel width while keeping detail inside the workspace', () => {
    expect(microAppRegistry.files.LayoutConfigBridge).toBeDefined()
    expect(microAppRegistry.files.header.itemTitle).toBe('文件预览')
  })

  it('keeps the primary Files header scoped to Pod resources rather than chat files', () => {
    expect(microAppRegistry.files.header.moduleSubtitle).toBe('Pod 资源与文件夹')
    expect(microAppRegistry.files.header.moduleSubtitle).not.toContain('话题')
  })

  it('has no 我的 AI page: rail, registry and routes drop it (R6)', () => {
    expect(microAppIds).not.toContain('my-ai')
    expect(isValidMicroAppId('my-ai')).toBe(false)
    expect(Object.values(microAppRegistry).map((app) => app.label)).not.toContain('我的 AI')
  })

  it('gives 我 and 个人资料 their own pages without a list pane', () => {
    expect(microAppRegistry.me.ListPane).toBeUndefined()
    expect(microAppRegistry.profile.ListPane).toBeUndefined()
    expect(microAppRegistry.profile.hideContentHeader).toBe(true)
  })
})
