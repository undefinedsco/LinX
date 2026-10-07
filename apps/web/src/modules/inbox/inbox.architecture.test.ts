import { describe, expect, it } from 'vitest'
import {
  dataForbiddenImports,
  expectExportOnlyFacade,
  expectFilesToExist,
  expectModuleDirectories,
  expectNoForbiddenImports,
  readModuleSource,
  uiForbiddenImports,
} from '@/test/module-architecture'

const root = 'src/modules/inbox'

// domain must not depend on any upper or sibling module. scene-restore lives in features
// because it imports @/modules/files/browser; domain stays fully closed with no exceptions.
const domainForbiddenImports = [
  /from ['"]react(?:\/|['"])/,
  /from ['"]zustand(?:\/|['"])/,
  /from ['"]@tanstack\/react-/,
  /from ['"]@\/components\//,
  /from ['"]@\/providers\//,
  /from ['"]@\/modules\/layout(?:\/|['"])/,
  /from ['"][.]{1,2}\/(?:app|data|features|ui)(?:\/|['"])/,
  /from ['"]@\/modules\/(?:chat|contacts|files)\//,
]

const uiForbiddenImportsWithCrossModuleStores = [
  ...uiForbiddenImports,
  /from ['"]@\/modules\/chat\/store['"]/,
  /from ['"]@\/modules\/contacts\/.*store['"]/,
  /from ['"]@\/modules\/files\/store['"]/,
]

describe('inbox module architecture', () => {
  it('uses the Files-standard layer skeleton', () => {
    expectModuleDirectories(root, ['app', 'data', 'domain', 'features', 'ui'])
    expectFilesToExist([
      `${root}/app/store.ts`,
      `${root}/data/collections.ts`,
      `${root}/domain/inbox-item.ts`,
      `${root}/domain/presentation.ts`,
      `${root}/domain/utils.ts`,
      `${root}/features/scene-restore.ts`,
      `${root}/features/list/InboxListPane.tsx`,
      `${root}/features/list/useInboxListPaneController.ts`,
      `${root}/features/detail/InboxContentPane.tsx`,
      `${root}/features/detail/useInboxContentPaneController.ts`,
      `${root}/features/bell/InboxBellButton.tsx`,
      `${root}/ui/InboxList.tsx`,
      `${root}/ui/InboxDetail.tsx`,
    ])
  })

  it('keeps canonical implementations in the layers, not the root facades', () => {
    const storeSource = readModuleSource(`${root}/app/store.ts`)
    const collectionsSource = readModuleSource(`${root}/data/collections.ts`)
    const utilsSource = readModuleSource(`${root}/domain/utils.ts`)

    expect(storeSource).toContain('create<InboxStoreState>')
    expect(collectionsSource).toContain('createPodCollection<')
    expect(collectionsSource).toContain('export const inboxOps')
    expect(utilsSource).toContain('export function isActionableInboxItem')
    expect(utilsSource).toContain('export function filterInboxItems')
  })

  it('composes the list pane from a feature controller and props-only UI', () => {
    const paneSource = readModuleSource(`${root}/features/list/InboxListPane.tsx`)
    const controllerSource = readModuleSource(`${root}/features/list/useInboxListPaneController.ts`)
    const listUiSource = readModuleSource(`${root}/ui/InboxList.tsx`)

    expect(paneSource).toContain("from './useInboxListPaneController'")
    expect(paneSource).toContain("from '../../ui/InboxList'")
    expect(paneSource).not.toMatch(/use(?:State|Effect|Memo|Callback|Query|Entity|Navigate|Session|Toast)\s*\(/)
    expect(paneSource).not.toMatch(/from ['"]\.\.\/\.\.\/(?:app|data)\//)

    expect(controllerSource).toContain("from '../../app/store'")
    expect(controllerSource).toContain("from '../../data/collections'")

    expect(listUiSource).not.toMatch(/use(?:State|Effect|Memo|Callback|Query|Entity|Navigate|Session|Toast)\s*\(/)
    expect(listUiSource).not.toMatch(/from ['"][^'"]*(?:app|data|features|store|collections)(?:\/|['"])/)
  })

  it('composes the detail pane from a feature controller and props-only UI', () => {
    const paneSource = readModuleSource(`${root}/features/detail/InboxContentPane.tsx`)
    const controllerSource = readModuleSource(`${root}/features/detail/useInboxContentPaneController.ts`)
    const detailUiSource = readModuleSource(`${root}/ui/InboxDetail.tsx`)

    expect(paneSource).toContain("from './useInboxContentPaneController'")
    expect(paneSource).toContain("from '../../ui/InboxDetail'")
    expect(paneSource).not.toMatch(/use(?:State|Effect|Memo|Callback|Query|Entity|Navigate|Session|Toast)\s*\(/)
    expect(paneSource).not.toMatch(/from ['"]\.\.\/\.\.\/(?:app|data)\//)

    expect(controllerSource).toContain("from '../../app/store'")
    expect(controllerSource).toContain("from '../../data/collections'")
    expect(controllerSource).toContain("from '../../domain/presentation'")
    expect(controllerSource).toContain("from '../../domain/utils'")

    expect(detailUiSource).not.toMatch(/use(?:State|Effect|Memo|Callback|Query|Entity|Navigate|Session|Toast)\s*\(/)
    expect(detailUiSource).not.toMatch(/from ['"][^'"]*(?:app|data|features|store|collections)(?:\/|['"])/)
  })

  it('keeps domain, data, and ui imports inside their ownership boundaries', () => {
    expectNoForbiddenImports(`${root}/domain`, domainForbiddenImports)
    expectNoForbiddenImports(`${root}/data`, dataForbiddenImports)
    expectNoForbiddenImports(`${root}/ui`, uiForbiddenImportsWithCrossModuleStores)
  })

  it('keeps legacy entry files as compatibility facades', () => {
    for (const file of [
      'store.ts',
      'collections.ts',
      'presentation.ts',
      'utils.ts',
      'scene-restore.ts',
      'components/InboxListPane.tsx',
      'components/InboxContentPane.tsx',
      'components/InboxBellButton.tsx',
    ]) {
      expectExportOnlyFacade(`${root}/${file}`)
    }

    const storeFacade = readModuleSource(`${root}/store.ts`)
    const collectionsFacade = readModuleSource(`${root}/collections.ts`)

    expect(storeFacade).not.toContain('create(')
    expect(storeFacade).not.toContain('zustand')
    expect(collectionsFacade).not.toContain('createPodCollection')
    expect(collectionsFacade).not.toContain('export const inboxOps')
  })
})
