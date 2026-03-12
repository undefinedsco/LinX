import {
  ContactType,
  agentTable,
  chatTable,
  contactTable,
  drizzle,
  eq,
  getBuiltinModels as getSharedBuiltinModels,
  linxSchema,
  messageTable,
  threadTable,
  type MessageRow,
  type ModelMetadata,
  type SolidDatabase,
  type ThreadRow,
} from '@linx/models'

export { ContactType, agentTable, chatTable, contactTable, drizzle, eq, linxSchema, messageTable, threadTable }
export type { MessageRow, ModelMetadata, SolidDatabase, ThreadRow }

export function getBuiltinModels(): ModelMetadata[] {
  return getSharedBuiltinModels()
}
