import { agentTable } from './agent.schema'
import { chatTable } from './chat.schema'
import { contactTable } from './contact.schema'
import { favoriteTable } from './favorite/favorite.schema'
import { fileTable } from './file/file.schema'
import { messageTable } from './message.schema'
import { modelProviderTable } from './model-provider.schema'
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
  modelProviderTable,
  fileTable,
  favoriteTable,
  settingsTable,
}
