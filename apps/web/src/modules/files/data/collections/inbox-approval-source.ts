import { inboxOps } from '@/modules/inbox/collections'

export function fetchFilesInboxApprovals() {
  return inboxOps.readApprovals()
}
