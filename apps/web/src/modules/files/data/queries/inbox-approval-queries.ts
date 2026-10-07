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
