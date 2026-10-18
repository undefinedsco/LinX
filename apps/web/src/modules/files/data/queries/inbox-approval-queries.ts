import {
  useApprovalByTarget,
  useResolveInboxApproval,
} from '@/modules/inbox/collections'

export function useFilesApprovalByTarget(...args: Parameters<typeof useApprovalByTarget>) {
  return useApprovalByTarget(...args)
}

export function useResolveFilesInboxApproval(...args: Parameters<typeof useResolveInboxApproval>) {
  return useResolveInboxApproval(...args)
}

/** 授权 under an assistant folder reuses the inbox grants table. */
export { GrantsView as FilesGrantsView } from '@/modules/inbox'
