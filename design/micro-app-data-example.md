# Micro App Data Layer Example: Contacts

This document illustrates how a micro app implements the data-layer interface described in `design-data-pipeline`.

## 1. Model & Repository (packages/models)
```ts
// packages/models/src/contact/contact.schema.ts
export const contactTable = podTable('contact', {
  id: uri('id').primary().notNull(),
  name: string('name').predicate(VCARD.fn).notNull(),
  email: string('email').predicate(VCARD.hasEmail),
  webId: uri('webId').predicate(FOAF.homepage).notNull(),
  avatar: uri('avatar').predicate(VCARD.hasPhoto),
  updatedAt: datetime('updatedAt').predicate(DCTerms.modified),
})

export type ContactRow = InferModel<typeof contactTable, 'select'>
export type ContactInsert = InferModel<typeof contactTable, 'insert'>
```

```ts
// packages/models/src/contact/contact.repository.ts
import { contactTable, type ContactRow, type ContactInsert } from './contact.schema'

export const contactRepository = createRepository({
  namespace: 'contact',
  list: async (filters?: ContactFilters) => {
    let query = db.select().from(contactTable)
    if (filters?.search) {
      query = query.where(ilike(contactTable.name, `%${filters.search}%`))
    }
    return query.execute()
  },
  detail: async (id: string) => db.select().from(contactTable).where(eq(contactTable.id, id)).execute()
  // ... create/update/delete
})
```

## 2. List & Detail configuration (apps/web)
```ts
// apps/web/src/modules/contact/data-layer.ts
import { registerMicroAppDataLayer } from '@/lib/micro-apps/registry'
import { contactRepository } from '@linx/models/contact'

const contactListConfig: ListConfig<ContactFilters> = {
  searchable: true,
  searchFields: ['name', 'email'],
  initialSort: { field: 'name', direction: 'asc' },
  pagination: { type: 'offset', pageSize: 25 },
}

const contactDetailConfig: DetailConfig<ContactRow, ContactDetailViewState> = {
  query: contactRepository.detail,
  initialViewState: () => ({
    activeTab: 'profile',
    expandedSections: { pods: true, notes: false },
  }),
}

registerMicroAppDataLayer({
  id: 'contacts',
  listConfig: contactListConfig,
  detailConfig: contactDetailConfig,
  queries: createRepositoryQueries(contactRepository),
  store: createContactStore(),
})
```

## 3. Store slice (Zustand)
```ts
const useContactStore = create<ContactStoreState>()((set) => ({
  entities: {},
  ids: [],
  selectedId: null,
  search: '',
  pagination: { page: 1, pageSize: 25 },
  detailView: contactDetailConfig.initialViewState(),
  actions: {
    select: (id) => set({ selectedId: id }),
    setSearch: (search) => set({ search }),
    setActiveTab: (tab) => set((state) => ({
      detailView: { ...state.detailView, activeTab: tab },
    })),
  },
}))
```

## 4. UI usage
```tsx
function ContactListPane() {
  const { data, isLoading } = useContactListQuery({ search: store.search })
  const { select } = useContactStore((state) => state.actions)
  // render list, search input, etc.
}

function ContactDetailPane() {
  const detail = useContactDetailQuery(store.selectedId)
  const { detailView, actions } = useContactStore()
  // render tabs using detailView.activeTab, call actions.setActiveTab on change
}
```

> TL;DR: to develop a micro app, you define the schema/repository, supply List/Detail configs, wire the generated queries, and hook them into a store slice. UI components then bind to the store/query hooks while the shared pipeline handles caching, search propagation, and invalidations.
