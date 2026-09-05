import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  dataForbiddenImports,
  expectExportOnlyFacade,
  expectFilesToExist,
  expectModuleDirectories,
  expectNoForbiddenImports,
  readModuleSource,
} from '@/test/module-architecture'

const root = 'src/modules/chat'

// Domain must stay closed to React, state stores, and all upper application layers.
const domainForbiddenImports = [
  /from ['"]react(?:\/|['"])/,
  /from ['"]zustand(?:\/|['"])/,
  /from ['"]@tanstack\/react-/,
  /from ['"]@\/components\//,
  /from ['"]@\/providers\//,
  /from ['"]@\/modules\//,
  /from ['"][.]{1,2}\/(?:app|data|features|ui)(?:\/|['"])/,
]

describe('chat module architecture', () => {
  it('uses the Files-standard layer skeleton', () => {
    expectModuleDirectories(root, ['app', 'data', 'domain', 'components'])
    expectFilesToExist([
      `${root}/app/store.ts`,
      `${root}/data/collections.ts`,
      `${root}/data/runtime-client.ts`,
      `${root}/data/matrix-service.ts`,
      `${root}/domain/agent-runtime-location.ts`,
      `${root}/domain/chat-participants.ts`,
      `${root}/domain/feature-flags.ts`,
    ])
  })

  it('keeps canonical implementations in the layers, not the root facades', () => {
    const storeSource = readModuleSource(`${root}/app/store.ts`)
    const collectionsSource = readModuleSource(`${root}/data/collections.ts`)
    const runtimeClientSource = readModuleSource(`${root}/data/runtime-client.ts`)

    expect(storeSource).toContain('create<ChatStore>')
    expect(collectionsSource).toContain('createPodCollection<')
    expect(runtimeClientSource).toContain('export function useRuntimeSession')
  })

  it('keeps domain and data imports inside their ownership boundaries', () => {
    expectNoForbiddenImports(`${root}/domain`, domainForbiddenImports)
    expectNoForbiddenImports(`${root}/data`, dataForbiddenImports)
  })

  it('keeps legacy entry files as compatibility facades', () => {
    for (const file of [
      'store.ts',
      'collections.ts',
      'runtime-client.ts',
      'matrix-service.ts',
      'agent-runtime-location.ts',
      'feature-flags.ts',
      'utils/chat-participants.ts',
    ]) {
      expectExportOnlyFacade(`${root}/${file}`)
    }

    const storeFacade = readModuleSource(`${root}/store.ts`)
    const collectionsFacade = readModuleSource(`${root}/collections.ts`)

    expect(storeFacade).not.toContain('create(')
    expect(storeFacade).not.toContain('zustand')
    expect(collectionsFacade).not.toContain('createPodCollection')
  })

  it('keeps ChatKit protocol commands behind the workbench adapter', () => {
    expectFilesToExist([
      `${root}/domain/conversation-workbench.ts`,
      `${root}/features/chatkit/chatkit-workbench-adapter.ts`,
      `${root}/features/chatkit/useChatKitSurface.ts`,
    ])

    const contentPane = readModuleSource(`${root}/components/ChatContentPane.tsx`)
    const chatKitPanel = readModuleSource(`${root}/features/chatkit/ChatKitPanel.tsx`)
    const chatKitSurface = readModuleSource(`${root}/features/chatkit/useChatKitSurface.ts`)
    const adapter = readModuleSource(`${root}/features/chatkit/chatkit-workbench-adapter.ts`)

    expect(contentPane).not.toContain('useChatKit')
    expect(chatKitPanel).not.toContain('useChatKit(')
    expect(chatKitSurface).toContain('createChatKitWorkbenchAdapter')
    expect(chatKitSurface).not.toMatch(/(?:await|void) chatkit\.sendCustomAction/)
    expect(adapter).toContain("messageAction('message.edit'")
    expect(adapter).toContain("messageAction('message.delete'")
    expect(adapter).toContain("messageAction('message.regenerate'")
  })

  it('keeps message action UI props-only', () => {
    for (const file of ['AttachmentWorkspaceDialogs.tsx', 'ChatGenerationControl.tsx', 'MessageEditDialog.tsx']) {
      const source = readModuleSource(`${root}/ui/${file}`)
      expect(source).not.toMatch(/useChatKit|useChatStore|useMessageList|createLocalChatKitFetch/)
      expect(source).not.toMatch(/from ['"]\.\.\/(?:data|features|services|app)/)
    }
  })

  it('keeps page and ChatKit containers below the god-component threshold', () => {
    const contentPane = readModuleSource(`${root}/components/ChatContentPane.tsx`)
    const chatKitPanel = readModuleSource(`${root}/features/chatkit/ChatKitPanel.tsx`)
    const chatKitSurface = readModuleSource(`${root}/features/chatkit/useChatKitSurface.ts`)
    expect(contentPane.split('\n').length).toBeLessThan(400)
    expect(chatKitPanel.split('\n').length).toBeLessThan(500)
    expect(chatKitSurface.split('\n').length).toBeLessThan(350)
  })

  it('does not retain or route through the retired custom message stack', () => {
    expect(existsSync(`${root}/components/Messages/index.ts`)).toBe(false)
    expect(existsSync(`${root}/components/Inputbar/index.ts`)).toBe(false)
    expect(existsSync(`${root}/mocks.ts`)).toBe(false)

    for (const directory of ['features', 'ui', 'domain']) {
      expectNoForbiddenImports(`${root}/${directory}`, [
        /from ['"][^'"]*components\/(?:Messages|Inputbar)/,
      ])
    }
  })
})
