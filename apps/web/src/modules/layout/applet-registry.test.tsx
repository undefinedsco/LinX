import { describe, expect, it } from 'vitest'
import { appletRegistry } from './applet-registry'

describe('appletRegistry', () => {
  it('lets Files configure only the shared list panel width while keeping detail inside the workspace', () => {
    expect(appletRegistry.files.LayoutConfigBridge).toBeDefined()
    expect(appletRegistry.files.header.itemTitle).toBe('文件预览')
  })

  it('keeps the primary Files header scoped to Pod resources rather than chat files', () => {
    expect(appletRegistry.files.header.moduleSubtitle).toBe('Pod 资源与文件夹')
    expect(appletRegistry.files.header.moduleSubtitle).not.toContain('话题')
  })
})
