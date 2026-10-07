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

const root = 'src/modules/favorites'

// domain must not depend on any upper or sibling module. scene-restore expresses its
// navigation target via the local FavoriteSceneAppId literal union instead of importing
// layout's MicroAppId, so layout is also forbidden and the domain boundary is fully closed.
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

describe('favorites module architecture', () => {
  it('uses the Files-standard layer skeleton', () => {
    expectModuleDirectories(root, ['app', 'data', 'domain', 'features', 'ui'])
    expectFilesToExist([
      `${root}/app/store.ts`,
      `${root}/data/collections.ts`,
      `${root}/domain/scene-restore.ts`,
      `${root}/domain/feature-flags.ts`,
      `${root}/features/list/FavoriteListPane.tsx`,
      `${root}/features/list/useFavoriteListPaneController.ts`,
      `${root}/features/detail/FavoriteContentPane.tsx`,
      `${root}/features/detail/useFavoriteContentPaneController.ts`,
      `${root}/ui/FavoriteList.tsx`,
      `${root}/ui/FavoriteDetail.tsx`,
    ])
  })

  it('keeps canonical implementations in the layers, not the root facades', () => {
    const storeSource = readModuleSource(`${root}/app/store.ts`)
    const collectionsSource = readModuleSource(`${root}/data/collections.ts`)
    const sceneRestoreSource = readModuleSource(`${root}/domain/scene-restore.ts`)

    expect(storeSource).toContain('create<FavoriteStore>')
    expect(collectionsSource).toContain('createPodCollection<')
    expect(collectionsSource).toContain('async function onStarredChange')
    expect(sceneRestoreSource).toContain('export function resolveFavoriteScene')
  })

  it('composes the list pane from a feature controller and props-only UI', () => {
    const paneSource = readModuleSource(`${root}/features/list/FavoriteListPane.tsx`)
    const controllerSource = readModuleSource(`${root}/features/list/useFavoriteListPaneController.ts`)
    const listUiSource = readModuleSource(`${root}/ui/FavoriteList.tsx`)

    expect(paneSource).toContain("from './useFavoriteListPaneController'")
    expect(paneSource).toContain("from '../../ui/FavoriteList'")
    expect(paneSource).not.toMatch(/use(?:State|Effect|Memo|Callback|Query|Entity|Navigate|Session|Toast)\s*\(/)
    expect(paneSource).not.toMatch(/from ['"]\.\.\/\.\.\/(?:app|data)\//)

    expect(controllerSource).toContain("from '../../app/store'")
    expect(controllerSource).toContain("from '../../data/collections'")

    expect(listUiSource).not.toMatch(/from ['"][^'"]*(?:app|data|features|store|collections)(?:\/|['"])/)
  })

  it('composes the detail pane from a feature controller and props-only UI', () => {
    const paneSource = readModuleSource(`${root}/features/detail/FavoriteContentPane.tsx`)
    const controllerSource = readModuleSource(`${root}/features/detail/useFavoriteContentPaneController.ts`)
    const detailUiSource = readModuleSource(`${root}/ui/FavoriteDetail.tsx`)

    expect(paneSource).toContain("from './useFavoriteContentPaneController'")
    expect(paneSource).toContain("from '../../ui/FavoriteDetail'")
    expect(paneSource).not.toMatch(/use(?:State|Effect|Memo|Callback|Query|Entity|Navigate|Session|Toast)\s*\(/)

    expect(controllerSource).toContain("from '../../app/store'")
    expect(controllerSource).toContain("from '../../data/collections'")
    expect(controllerSource).toContain("from '../../domain/scene-restore'")
    expect(controllerSource).toContain('resolveFavoriteScene')

    expect(detailUiSource).not.toMatch(/from ['"][^'"]*(?:app|data|features|store|collections|scene-restore)(?:\/|['"])/)
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
      'scene-restore.ts',
      'feature-flags.ts',
      'components/FavoriteListPane.tsx',
      'components/FavoriteContentPane.tsx',
    ]) {
      expectExportOnlyFacade(`${root}/${file}`)
    }

    const storeFacade = readModuleSource(`${root}/store.ts`)
    const collectionsFacade = readModuleSource(`${root}/collections.ts`)
    const sceneRestoreFacade = readModuleSource(`${root}/scene-restore.ts`)

    expect(storeFacade).not.toContain('create(')
    expect(storeFacade).not.toContain('zustand')
    expect(collectionsFacade).not.toContain('createPodCollection')
    expect(collectionsFacade).not.toContain('async function onStarredChange')
    expect(sceneRestoreFacade).not.toContain('resolveFavoriteScene(')
  })
})
