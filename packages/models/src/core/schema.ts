import { agentTable } from './agent.schema.js'
import { agentProviderTable } from './agent-provider.schema.js'
import { agentStatusTable } from './agent-status.schema.js'
import { aiConfigTable } from './ai-config.schema.js'
import { approvalTable } from './approval.schema.js'
import { auditTable } from './audit.schema.js'
import { aiModelTable } from './ai-model.schema.js'
import { aiProviderTable } from './ai-provider.schema.js'
import { chatTable } from './chat.schema.js'
import { contactTable } from './contact.schema.js'
import { credentialTable } from './credential.schema.js'
import { favoriteTable } from './favorite/favorite.schema.js'
import { fileTable } from './file/file.schema.js'
import { grantTable } from './grant.schema.js'
import { inboxNotificationTable } from './inbox-notification.schema.js'
import { messageTable } from './message.schema.js'
import { solidProfileTable } from './profile.js'
import { settingsTable } from './settings/settings.schema.js'
import { threadTable } from './thread.schema.js'
import { indexedFileTable, vectorStoreTable } from './vector-store.schema.js'
import { workspaceTable } from './workspace.schema.js'

export const linxSchema = {
  solidProfileTable,
  contactTable,
  agentTable,
  agentProviderTable,
  agentStatusTable,
  chatTable,
  threadTable,
  workspaceTable,
  messageTable,
  credentialTable,
  aiProviderTable,
  aiModelTable,
  aiConfigTable,
  vectorStoreTable,
  indexedFileTable,
  fileTable,
  favoriteTable,
  settingsTable,

  // Sidecar collaboration data
  approvalTable,
  auditTable,
  grantTable,
  inboxNotificationTable,
}
