import { describe, expect, it } from 'vitest'
import { microAppRegistry } from './micro-app-registry'

describe('microAppRegistry', () => {
  it('lets Files configure only the shared list panel width while keeping detail inside the workspace', () => {
    expect(microAppRegistry.files.LayoutConfigBridge).toBeDefined()
    expect(microAppRegistry.files.header.itemTitle).toBe('文件预览')
  })

  it('keeps the primary Files header scoped to Pod resources rather than chat files', () => {
    expect(microAppRegistry.files.header.moduleSubtitle).toBe('Pod 资源与文件夹')
    expect(microAppRegistry.files.header.moduleSubtitle).not.toContain('话题')
  })
})
