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

const root = 'src/modules/model-services'

describe('model-services module architecture', () => {
  it('uses the Files-standard layer skeleton', () => {
    expectModuleDirectories(root, ['app', 'data', 'domain', 'features', 'ui'])
    expectFilesToExist([
      `${root}/app/store.ts`,
      `${root}/app/ModelServicesLayoutConfigBridge.tsx`,
      `${root}/data/collections.ts`,
      `${root}/data/use-model-services.ts`,
      `${root}/domain/provider-catalog.ts`,
      `${root}/features/list/ModelServicesListPane.tsx`,
      `${root}/features/list/useModelServicesListPaneController.ts`,
      `${root}/features/detail/ModelServicesContentPane.tsx`,
      `${root}/features/detail/useModelServicesContentPaneController.ts`,
      `${root}/domain/model-services-projection.ts`,
      `${root}/ui/ModelProviderList.tsx`,
      `${root}/ui/ModelServicesDetailView.tsx`,
      `${root}/ui/ModelServicesListView.tsx`,
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
      'ModelServicesContentPane.tsx',
      'ModelServicesListPane.tsx',
      'ModelServicesLayoutConfigBridge.tsx',
      'collections.ts',
      'constants.ts',
      'store.ts',
      'types.ts',
      'useLayoutConfig.tsx',
      'hooks/useModelServices.ts',
      'services/model-fetcher.ts',
    ]) {
      expectExportOnlyFacade(`${root}/${file}`)
    }
  })

  it('keeps feature renderers as controller and props-only UI composition', () => {
    const detailRenderer = readModuleSource(`${root}/features/detail/ModelServicesContentPane.tsx`)
    const listRenderer = readModuleSource(`${root}/features/list/ModelServicesListPane.tsx`)

    for (const [file, source] of [
      ['detail renderer', detailRenderer],
      ['list renderer', listRenderer],
    ] as const) {
      expect(source, `${file} must not own React state or effects`).not.toMatch(/\buse(?:State|Effect|Memo|Callback)\b/)
      expect(source, `${file} must not access data or app state directly`).not.toMatch(
        /(?:\buseModelServicesStore\b|\buseModelServices\b|\bsearchProviderModels\b)/,
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

    expect(detailRenderer).toMatch(/useModelServicesContentPaneController/)
    expect(detailRenderer).toMatch(/ModelServicesDetailView/)
    expect(detailRenderer).toMatch(/ModelEditorDialog/)
    expect(listRenderer).toMatch(/useModelServicesListPaneController/)
    expect(listRenderer).toMatch(/ModelServicesListView/)
  })

  it('keeps persistence and query ownership out of props-only UI', () => {
    for (const file of [
      'ModelServicesDetailView.tsx',
      'ModelServicesListView.tsx',
      'ModelEditorDialog.tsx',
    ]) {
      const source = readModuleSource(`${root}/ui/${file}`)
      expect(source, `${file} must not own feature persistence or queries`).not.toMatch(
        /(?:updateProvider|useModelServicesStore|useModelServices|searchProviderModels|useToast)/,
      )
    }

    for (const file of ['ModelServicesDetailView.tsx', 'ModelServicesListView.tsx']) {
      const source = readModuleSource(`${root}/ui/${file}`)
      expect(source, `${file} must render entirely from props`).not.toMatch(/\buse(?:State|Effect|Memo|Callback)\b/)
    }
  })

  it('requires live-query failures to remain explicit data output', () => {
    const source = readModuleSource(`${root}/data/use-model-services.ts`)
    expect(source).toMatch(/credentialQuery\.isError/)
    expect(source).toMatch(/providerQuery\.isError/)
    expect(source).toMatch(/modelQuery\.isError/)
    expect(source).toMatch(/error: queryError/)
  })

  it('routes shell composition and bootstrap to canonical owners', () => {
    const registry = readModuleSource('src/modules/layout/micro-app-registry.tsx')
    const bootstrap = readModuleSource('src/providers/pod-collections-bootstrap.tsx')

    expect(registry).toContain("@/modules/model-services/features/list/ModelServicesListPane")
    expect(registry).toContain("@/modules/model-services/features/detail/ModelServicesContentPane")
    expect(registry).toContain("@/modules/model-services/app/ModelServicesLayoutConfigBridge")
    expect(bootstrap).toContain("@/modules/model-services/data/collections")
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
