import { definePodRepository } from './repository.js'
import { contactTable, type ContactRow, type ContactInsert, type ContactUpdate } from './contact.schema.js'

export const contactRepository = definePodRepository<
  typeof contactTable,
  ContactRow,
  ContactInsert,
  ContactUpdate
>({
  namespace: 'contact',
  table: contactTable,
  searchableFields: ['name', 'alias', 'note'],
  defaultSort: { field: 'name', direction: 'asc' },
})



