export { ContactListPane } from './features/list/ContactListPane'
export { ContactDetailPane } from './features/detail/ContactDetailPane'
export { AddFriendForm } from './features/add-friend/AddFriendForm'
export { CreateGroupDialog } from './features/groups/CreateGroupDialog'
export { ContactPickerDialog } from './features/picker/ContactPickerDialog'
export { MemberList } from './ui/MemberList'
export { SelectableContactList } from './ui/SelectableContactList'
export type { GroupMember, MemberRole } from './ui/MemberList'
export { useContactStore } from './app/store'
export type { ContactViewMode, CreateContactType } from './app/store'
export type {
  UnifiedContact,
  GroupContactInfo,
  ContactEntry,
  ContactSection,
  SectionKey,
  ContactSourceType,
  ContactTag,
} from './domain/types'
export { contactOps, contactCollection, initializeContactCollections } from './data/collections'
export { CONTACTS_CP1_ENABLED } from './app/feature-flags'
export { useSharedWithMe, type SharedWithMeItem } from './features/shared/useSharedWithMe'
export { useWhoCanSeeMe, type PublicContactEntry, type WhoCanSeeMe } from './features/shared/useWhoCanSeeMe'
