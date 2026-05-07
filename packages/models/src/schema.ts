import { agentTable } from './agent.schema'
import { approvalResource, approvalTable } from './approval.schema'
import { auditResource, auditTable } from './audit.schema'
import { aiModelTable } from './ai-model.schema'
import { aiProviderTable } from './ai-provider.schema'
import { chatResource, chatTable } from './chat.schema'
import { contactTable } from './contact.schema'
import { credentialTable } from './credential.schema'
import { favoriteTable } from './favorite/favorite.schema'
import { fileTable } from './file/file.schema'
import { grantResource, grantTable } from './grant.schema'
import { inboxNotificationTable } from './inbox-notification.schema'
import { messageResource, messageTable } from './message.schema'
import { solidProfileTable } from './profile.schema'
import { sessionResource, sessionTable } from './session'
import { settingsTable } from './settings/settings.schema'
import { threadResource, threadTable } from './thread.schema'

export const solidResources = {
  solidProfileTable,
  contactTable,
  agentTable,
  chatResource,
  sessionResource,
  threadResource,
  messageResource,
  credentialTable,
  aiProviderTable,
  aiModelTable,
  fileTable,
  favoriteTable,
  settingsTable,

  // Sidecar collaboration data
  approvalResource,
  auditResource,
  grantResource,
  inboxNotificationTable,
}

// Compatibility schema for existing drizzle-solid call sites.
export const solidSchema = {
  solidProfileTable,
  contactTable,
  agentTable,
  chatTable,
  sessionTable,
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
