import { describe, expect, it } from 'vitest'
import {
  dataForbiddenImports,
  domainForbiddenImports,
  expectExportOnlyFacade,
  expectFilesToExist,
  expectModuleDirectories,
  expectNoForbiddenImports,
  listModuleSourceFiles,
  uiForbiddenImports,
  readModuleSource,
} from '@/test/module-architecture'

const root = 'src/modules/ai-connections'

describe('ai-connections module architecture', () => {
  it('uses the Files-standard layer skeleton', () => {
    expectModuleDirectories(root, ['app', 'data', 'domain', 'features', 'ui'])
    expectFilesToExist([
      `${root}/app/store.ts`,
      `${root}/app/AiConnectionsLayoutConfigBridge.tsx`,
      `${root}/data/collections.ts`,
      `${root}/data/use-ai-connections.ts`,
      `${root}/domain/provider-catalog.ts`,
      `${root}/features/list/AiConnectionsListPane.tsx`,
      `${root}/features/list/useAiConnectionsListPaneController.ts`,
      `${root}/features/detail/AiConnectionsContentPane.tsx`,
      `${root}/features/detail/useAiConnectionsContentPaneController.ts`,
      `${root}/domain/ai-connections-projection.ts`,
      `${root}/ui/ModelProviderList.tsx`,
      `${root}/ui/AiConnectionsDetailView.tsx`,
      `${root}/ui/AiConnectionsListView.tsx`,
      `${root}/ui/ModelEditorDialog.tsx`,
    ])
  })

  it('keeps domain, data, and ui imports inside their ownership boundaries', () => {
    expectNoForbiddenImports(`${root}/domain`, domainForbiddenImports)
    expectNoForbiddenImports(`${root}/data`, dataForbiddenImports)
    expectNoForbiddenImports(`${root}/ui`, uiForbiddenImports)
  })

  it('keeps legacy entry files as compatibility facades', () => {
    for (const file of [
      'AiConnectionsContentPane.tsx',
      'AiConnectionsListPane.tsx',
      'AiConnectionsLayoutConfigBridge.tsx',
      'collections.ts',
      'constants.ts',
      'store.ts',
      'types.ts',
      'useLayoutConfig.tsx',
      'hooks/useAiConnections.ts',
      'services/model-fetcher.ts',
    ]) {
      expectExportOnlyFacade(`${root}/${file}`)
    }
  })

  it('keeps feature renderers as controller and props-only UI composition', () => {
    const detailRenderer = readModuleSource(`${root}/features/detail/AiConnectionsContentPane.tsx`)
    const listRenderer = readModuleSource(`${root}/features/list/AiConnectionsListPane.tsx`)

    for (const [file, source] of [
      ['detail renderer', detailRenderer],
      ['list renderer', listRenderer],
    ] as const) {
      expect(source, `${file} must not own React state or effects`).not.toMatch(/\buse(?:State|Effect|Memo|Callback)\b/)
      expect(source, `${file} must not access data or app state directly`).not.toMatch(
        /(?:\buseAiConnectionsStore\b|\buseAiConnections\b|\bsearchProviderModels\b)/,
      )
      expect(source, `${file} must not render shared UI primitives directly`).not.toMatch(
        /@\/components\/ui\//,
      )
      expect(source, `${file} must not render DOM markup directly`).not.toMatch(
        /<(?:div|span|button|input|section|header|main)\b/,
      )
      expect(source, `${file} must not import app, data, or domain owners`).not.toMatch(
        /from ['"][.]{1,2}\/[^'"]*(?:app|data|domain)\//,
      )
    }

    expect(detailRenderer).toMatch(/useAiConnectionsContentPaneController/)
    expect(detailRenderer).toMatch(/AiConnectionsDetailView/)
    expect(detailRenderer).toMatch(/ModelEditorDialog/)
    expect(listRenderer).toMatch(/useAiConnectionsListPaneController/)
    expect(listRenderer).toMatch(/AiConnectionsListView/)
  })

  it('keeps persistence and query ownership out of props-only UI', () => {
    for (const file of [
      'AiConnectionsDetailView.tsx',
      'AiConnectionsListView.tsx',
      'ModelEditorDialog.tsx',
    ]) {
      const source = readModuleSource(`${root}/ui/${file}`)
      expect(source, `${file} must not own feature persistence or queries`).not.toMatch(
        /(?:updateProvider|useAiConnectionsStore|useAiConnections|searchProviderModels|useToast)/,
      )
    }

    for (const file of ['AiConnectionsDetailView.tsx', 'AiConnectionsListView.tsx']) {
      const source = readModuleSource(`${root}/ui/${file}`)
      expect(source, `${file} must render entirely from props`).not.toMatch(/\buse(?:State|Effect|Memo|Callback)\b/)
    }
  })

  it('requires live-query failures to remain explicit data output', () => {
    const source = readModuleSource(`${root}/data/use-ai-connections.ts`)
    expect(source).toMatch(/credentialQuery\.isError/)
    expect(source).toMatch(/providerQuery\.isError/)
    expect(source).toMatch(/modelQuery\.isError/)
    expect(source).toMatch(/error: queryError/)
  })

  it('routes shell composition and bootstrap to canonical owners', () => {
    const registry = readModuleSource('src/modules/layout/applet-registry.tsx')
    const bootstrap = readModuleSource('src/providers/pod-collections-bootstrap.tsx')

    expect(registry).toContain("@/modules/ai-connections/features/list/AiConnectionsListPane")
    expect(registry).toContain("@/modules/ai-connections/features/detail/AiConnectionsContentPane")
    expect(registry).toContain("@/modules/ai-connections/app/AiConnectionsLayoutConfigBridge")
    expect(bootstrap).toContain("@/modules/ai-connections/data/collections")
  })

  it('keeps shared model contracts in @undefineds.co/models and owns one collection set', () => {
    const dataOwner = readModuleSource(`${root}/data/collections.ts`)
    const domainTypes = readModuleSource(`${root}/domain/types.ts`)

    expect(dataOwner).toContain("from '@undefineds.co/models'")
    expect(dataOwner).toContain('credentialResource')
    expect(dataOwner).toContain('aiProviderResource')
    expect(dataOwner).toContain('aiModelResource')
    expect(domainTypes).toContain("from '@undefineds.co/models'")

    const collectionInstantiations = listModuleSourceFiles(root)
      .filter((filePath) => readModuleSource(filePath).includes('createPodCollection<'))
    expect(collectionInstantiations).toEqual([`${root}/data/collections.ts`])
  })
})
