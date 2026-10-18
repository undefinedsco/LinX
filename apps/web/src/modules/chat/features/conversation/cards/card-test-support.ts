import { vi } from 'vitest'
import type { InboxItem } from '@/modules/inbox/domain/inbox-item'

/** Shared fixtures: requests as the inbox reads them from the Pod. */
export const inbox = {
  items: [] as InboxItem[],
  isLoading: false,
  resolveApproval: vi.fn(async (_input: unknown) => undefined),
  resolveInput: vi.fn(async (_input: unknown) => undefined),
}

export function resetInbox(items: InboxItem[] = []) {
  inbox.items = items
  inbox.isLoading = false
  inbox.resolveApproval = vi.fn(async () => undefined)
  inbox.resolveInput = vi.fn(async () => undefined)
}

export const APPROVAL_URI = 'https://alice.example/.data/approvals/2026/10/16.ttl#ap1'
export const INPUT_URI = 'https://alice.example/.data/input-requests/2026/10/16.ttl#in1'

export function approvalItem(status = 'pending', extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'approval:2026/10/16.ttl#ap1',
    kind: 'approval',
    category: 'approval',
    title: '发送周报给王芳？',
    description: '会发出一封邮件',
    timestamp: '2026-10-16T08:00:00Z',
    status,
    chatId: 'c1',
    threadId: 't1',
    approval: { id: '2026/10/16.ttl#ap1', status, risk: 'low', toolName: 'read_file', action: 'http://www.w3.org/ns/odrl/2/read', target: 'https://alice.example/doc', context: JSON.stringify({ 收件人: '王芳' }) } as never,
    ...extra,
  }
}

export function inputItem(status = 'pending', extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'input_request:2026/10/16.ttl#in1',
    kind: 'input_request',
    category: 'input_request',
    title: '周报发给谁？',
    description: '',
    timestamp: '2026-10-16T08:00:00Z',
    status,
    chatId: 'c1',
    threadId: 't1',
    inputRequest: { id: '2026/10/16.ttl#in1', status, requestKind: 'text', inputOptions: JSON.stringify([{ label: '王芳', value: '王芳' }, { label: '李明', value: '李明' }]) } as never,
    ...extra,
  }
}

export function loginItem(status = 'pending', extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'audit:login1',
    kind: 'audit',
    category: 'auth_required',
    title: '登录日历服务',
    description: '',
    timestamp: '2026-10-16T08:00:00Z',
    status,
    chatId: 'c1',
    threadId: 't1',
    authUrl: 'https://calendar.example/login',
    inputRequest: { id: '2026/10/16.ttl#in2', status } as never,
    ...extra,
  }
}
