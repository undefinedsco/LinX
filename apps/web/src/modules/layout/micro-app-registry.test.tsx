import { describe, expect, it } from 'vitest'
import { microAppRegistry } from './micro-app-registry'

describe('microAppRegistry', () => {
  it('keeps Files detail inside the Files workspace instead of a layout right sidebar', () => {
    expect(microAppRegistry.files.LayoutConfigBridge).toBeUndefined()
  })

  it('keeps the primary Files header scoped to Pod resources rather than chat files', () => {
    expect(microAppRegistry.files.header.moduleSubtitle).toBe('Pod 资源与文件夹')
    expect(microAppRegistry.files.header.moduleSubtitle).not.toContain('话题')
  })
})
