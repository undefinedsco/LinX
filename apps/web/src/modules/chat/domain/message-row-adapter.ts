import type { MessageRow } from '@undefineds.co/models'
import type { MessageData } from '../components/Messages/Message'

export interface MessageBranchMetadata {
  parentItemId?: string
  branchId?: string
  supersedes?: string
}

export function readMessageBranchMetadata(row: MessageRow): MessageBranchMetadata {
  const raw = (row as any).richContent
  if (typeof raw !== 'string') return {}
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    return {
      parentItemId: typeof value.parent_item_id === 'string' ? value.parent_item_id : undefined,
      branchId: typeof value.branch_id === 'string' ? value.branch_id : undefined,
      supersedes: typeof value.supersedes === 'string' ? value.supersedes : undefined,
    }
  } catch {
    return {}
  }
}

function normalizeRole(role: unknown): MessageData['role'] {
  return role === 'assistant' || role === 'system' ? role : 'user'
}

function normalizeStatus(status: unknown): MessageData['status'] {
  if (status === 'pending' || status === 'sending' || status === 'sent' || status === 'error') return status
  return undefined
}

/** Maps the Pod message projection used by live queries to the native message UI contract. */
export function projectMessageRow(row: MessageRow): MessageData {
  return {
    id: String(row.id),
    role: normalizeRole(row.role),
    content: typeof row.content === 'string' ? row.content : undefined,
    richContent: typeof row.richContent === 'string' ? row.richContent : undefined,
    status: normalizeStatus(row.status),
    createdAt: row.createdAt ?? undefined,
    updatedAt: row.updatedAt ?? undefined,
  }
}

export function projectMessageRows(rows: readonly MessageRow[]): MessageData[] {
  return rows.map(projectMessageRow)
}
