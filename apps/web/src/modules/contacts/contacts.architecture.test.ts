import { describe, expect, it } from 'vitest'
import {
  dataForbiddenImports,
  domainForbiddenImports,
  expectExportOnlyFacade,
  expectFilesToExist,
  expectModuleDirectories,
  expectNoForbiddenImports,
  listModuleSourceFiles,
  readModuleSource,
  uiForbiddenImports,
} from '@/test/module-architecture'

const root = 'src/modules/contacts'

describe('contacts module architecture', () => {
  it('uses the Files-standard layer skeleton', () => {
    expectModuleDirectories(root, ['app', 'data', 'domain', 'features', 'ui'])
    expectFilesToExist([
      `${root}/app/store.ts`,
      `${root}/data/collections.ts`,
      `${root}/domain/contact-projection.ts`,
      `${root}/features/list/ContactListPane.tsx`,
      `${root}/features/detail/ContactDetailPane.tsx`,
      `${root}/features/detail/useAgentEditingController.ts`,
      `${root}/features/detail/useContactDetailController.ts`,
      `${root}/features/detail/useContactDeletionNavigationController.ts`,
      `${root}/features/detail/useContactGroupMembershipController.ts`,
      `${root}/features/detail/useContactProfileSyncController.ts`,
      `${root}/ui/ContactList.tsx`,
      `${root}/ui/ContactDetail.tsx`,
      `${root}/ui/SelectableContactList.tsx`,
    ])
  })

  it('composes contact detail from a feature controller and props-only UI', () => {
    const paneSource = readModuleSource(`${root}/features/detail/ContactDetailPane.tsx`)
    const controllerSource = readModuleSource(`${root}/features/detail/useContactDetailController.ts`)
    const detailUiSource = readModuleSource(`${root}/ui/ContactDetail.tsx`)

    expect(paneSource).toContain("from './useContactDetailController'")
    expect(paneSource).toContain("from '../../ui/ContactDetail'")
    expect(paneSource).not.toMatch(/use(?:State|Effect|Memo|Callback|Query|Entity|Navigate|Session|Toast)\s*\(/)
    expect(paneSource).not.toMatch(/from ['"]\.\.\/\.\.\/(?:app|data)\//)

    expect(controllerSource).toContain("from './useAgentEditingController'")
    expect(controllerSource).toContain("from './useContactDeletionNavigationController'")
    expect(controllerSource).toContain("from './useContactGroupMembershipController'")
    expect(controllerSource).toContain("from './useContactProfileSyncController'")
    expect(controllerSource).toContain('projectContactDetail')

    expect(detailUiSource).not.toMatch(/use(?:State|Effect|Memo|Callback|Query|Entity|Navigate|Session|Toast)\s*\(/)
    expect(detailUiSource).not.toMatch(/from ['"][^'"]*(?:app|data|features|store|collections)(?:\/|['"])/)
  })

  it('keeps domain, data, and ui imports inside their ownership boundaries', () => {
    expectNoForbiddenImports(`${root}/domain`, domainForbiddenImports)
    expectNoForbiddenImports(`${root}/data`, dataForbiddenImports)
    expectNoForbiddenImports(`${root}/ui`, uiForbiddenImports)
  })

  it('keeps legacy entry files as compatibility facades', () => {
    for (const file of ['collections.ts', 'store.ts', 'types.ts', ...[
      'ContactDetailPane.tsx',
      'ContactListPane.tsx',
      'CreateGroupDialog.tsx',
      'MemberList.tsx',
      'SelectableContactList.tsx',
    ].map((name) => `components/${name}`)]) {
      expectExportOnlyFacade(`${root}/${file}`)
    }
  })

  it('owns the only Contact and Agent Collection instances and composes Chat through ports', () => {
    const chatSource = readModuleSource('src/modules/chat/collections.ts')
    const resourceCollectionsSource = readModuleSource(`${root}/data/resource-collections.ts`)
    const bootstrapSource = readModuleSource('src/providers/pod-collections-bootstrap.tsx')

    expect(resourceCollectionsSource).toContain('createPodCollection<typeof contactResource')
    expect(resourceCollectionsSource).toContain('createPodCollection<typeof agentResource')
    expect(chatSource).not.toMatch(/from ['"]@\/modules\/contacts\//)
    expect(chatSource).not.toContain('createPodCollection<typeof contactResource')
    expect(chatSource).not.toContain('createPodCollection<typeof agentResource')
    expect(bootstrapSource).toContain('configureChatContactsPort')
    expect(bootstrapSource).toContain('configureContactsChatPort')

    for (const filePath of listModuleSourceFiles(root)) {
      expect(readModuleSource(filePath), `${filePath} must consume Chat through an injected port`)
        .not.toMatch(/from ['"]@\/modules\/chat\//)
    }

    for (const filePath of listModuleSourceFiles('src/modules/chat')) {
      expect(readModuleSource(filePath), `${filePath} must use the Contacts public API or injected port`)
        .not.toMatch(/from ['"]@\/modules\/contacts\/data\//)
    }

    const collectionInstantiations = listModuleSourceFiles('src/modules')
      .filter((filePath) => {
        const source = readModuleSource(filePath)
        return source.includes('createPodCollection<typeof contactResource')
          || source.includes('createPodCollection<typeof agentResource')
      })
    expect(collectionInstantiations).toEqual([`${root}/data/resource-collections.ts`])
  })

  it('routes shell composition to canonical feature owners', () => {
    const registry = readModuleSource('src/modules/layout/micro-app-registry.tsx')
    expect(registry).toContain("@/modules/contacts/features/list/ContactListPane")
    expect(registry).toContain("@/modules/contacts/features/detail/ContactDetailPane")
  })
})
