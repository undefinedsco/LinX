import { agentTable } from './agent.schema'
import { approvalTable } from './approval.schema'
import { auditTable } from './audit.schema'
import { aiModelTable } from './ai-model.schema'
import { aiProviderTable } from './ai-provider.schema'
import { chatTable } from './chat.schema'
import { contactTable } from './contact.schema'
import { credentialTable } from './credential.schema'
import { favoriteTable } from './favorite/favorite.schema'
import { fileTable } from './file/file.schema'
import { grantTable } from './grant.schema'
import { inboxNotificationTable } from './inbox-notification.schema'
import { messageTable } from './message.schema'
import { solidProfileTable } from './profile'
import { settingsTable } from './settings/settings.schema'
import { threadTable } from './thread.schema'

export const linxSchema = {
  solidProfileTable,
  contactTable,
  agentTable,
  chatTable,
  threadTable,
  messageTable,
  credentialTable,
  aiProviderTable,
  aiModelTable,
  fileTable,
  favoriteTable,
  settingsTable,

  // Sidecar collaboration data
  approvalTable,
  auditTable,
  grantTable,
  inboxNotificationTable,
}
