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

// domain must not depend on any upper or sibling module. The secretary projection consumes
// the collections facade through a relative import, but the boundary stays fully closed to
// react/zustand and every @/modules/*, @/components/, @/providers/ import, with no exceptions.
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
})
