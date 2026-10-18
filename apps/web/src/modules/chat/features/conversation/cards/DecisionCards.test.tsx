import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { APPROVAL_URI, INPUT_URI, approvalItem, inbox, inputItem, loginItem, resetInbox } from './card-test-support'
import { ApprovalCard, InputCard, LoginCard } from './DecisionCards'

vi.mock('@/modules/inbox/collections', () => ({
  useInboxItems: () => ({ data: inbox.items, isLoading: inbox.isLoading }),
  useResolveInboxApproval: () => ({ mutateAsync: (input: unknown) => inbox.resolveApproval(input) }),
  useResolveInboxInputRequest: () => ({ mutateAsync: (input: unknown) => inbox.resolveInput(input) }),
}))
vi.mock('@/providers/solid-database-provider', () => ({ useSolidDatabase: () => ({ db: null }) }))
vi.mock('@/providers/solid-session-context', () => ({ useSession: () => ({ session: { info: { webId: 'https://alice.example/profile/card#me' } } }) }))

beforeEach(() => resetInbox())

describe('approval card', () => {
  it('reads the request from the Pod and writes the decision back', async () => {
    resetInbox([approvalItem()])
    render(<ApprovalCard uri={APPROVAL_URI} />)
    expect(screen.getByText('发送周报给王芳？')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '批准这一次' }))
    await waitFor(() => expect(inbox.resolveApproval).toHaveBeenCalledTimes(1))
    expect(inbox.resolveApproval.mock.calls[0][0]).toMatchObject({ decision: 'approved', approval: { id: '2026/10/16.ttl#ap1' } })
  })

  it('rejects with the same resource write', async () => {
    resetInbox([approvalItem()])
    render(<ApprovalCard uri={APPROVAL_URI} />)
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    await waitFor(() => expect(inbox.resolveApproval).toHaveBeenCalledTimes(1))
    expect(inbox.resolveApproval.mock.calls[0][0]).toMatchObject({ decision: 'rejected' })
  })

  it('keeps the card and offers a retry when the write fails', async () => {
    resetInbox([approvalItem()])
    inbox.resolveApproval = vi.fn(async () => { throw new Error('offline') })
    render(<ApprovalCard uri={APPROVAL_URI} />)
    fireEvent.click(screen.getByRole('button', { name: '批准这一次' }))
    expect((await screen.findByRole('alert')).textContent).toContain('没提交成功')
    expect(screen.getByRole('button', { name: '再试一次' })).toBeTruthy()
  })

  it('shows the outcome of a request decided elsewhere, without buttons', () => {
    resetInbox([approvalItem('approved')])
    render(<ApprovalCard uri={APPROVAL_URI} />)
    expect(screen.getByRole('status').textContent).toContain('已在收件箱批准')
    expect(screen.queryByRole('button', { name: '批准这一次' })).toBeNull()
  })

  it('says so when the resource cannot be read, and waits while it loads', () => {
    resetInbox([])
    const { unmount } = render(<ApprovalCard uri={APPROVAL_URI} />)
    expect(screen.getByText(/这个请求读不到了/u)).toBeTruthy()
    unmount()
    inbox.isLoading = true
    render(<ApprovalCard uri={APPROVAL_URI} />)
    expect(screen.getByText('正在读取…')).toBeTruthy()
  })
})

describe('input card', () => {
  it('sends a picked option back as the answer', async () => {
    resetInbox([inputItem()])
    render(<InputCard uri={INPUT_URI} />)
    fireEvent.click(screen.getByRole('radio', { name: '李明' }))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => expect(inbox.resolveInput).toHaveBeenCalledTimes(1))
    expect(inbox.resolveInput.mock.calls[0][0]).toMatchObject({ response: '李明', inputRequest: { id: '2026/10/16.ttl#in1' } })
  })

  it('needs an answer before 提交 and keeps the answer when the write fails', async () => {
    resetInbox([inputItem()])
    inbox.resolveInput = vi.fn(async () => { throw new Error('offline') })
    render(<InputCard uri={INPUT_URI} />)
    expect((screen.getByRole('button', { name: '提交' }) as HTMLButtonElement).disabled).toBe(true)
    const box = screen.getByLabelText('其他回答') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '赵六' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    expect((await screen.findByRole('alert')).textContent).toContain('没提交成功')
    expect(box.value).toBe('赵六')
  })

  it('offers 重新问 for an expired request', () => {
    const onReask = vi.fn()
    resetInbox([inputItem('expired')])
    render(<InputCard uri={INPUT_URI} onReask={onReask} />)
    fireEvent.click(screen.getByRole('button', { name: '让助手重新问一次' }))
    expect(onReask).toHaveBeenCalledWith('周报发给谁？')
  })

  it('hides a secret answer behind a password field', () => {
    resetInbox([inputItem('pending', { inputRequest: { id: '2026/10/16.ttl#in1', status: 'pending', requestKind: 'secret' } as never })])
    render(<InputCard uri={INPUT_URI} />)
    expect(screen.getByLabelText('周报发给谁？').getAttribute('type')).toBe('password')
    expect(screen.getByText('不会出现在聊天记录里')).toBeTruthy()
  })
})

describe('login card', () => {
  it('opens the sign-in page and confirms by writing the request', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    resetInbox([loginItem()])
    render(<LoginCard uri="https://alice.example/.data/input-requests/2026/10/16.ttl#in2" />)
    fireEvent.click(screen.getByRole('button', { name: /去登录/u }))
    expect(open).toHaveBeenCalledWith('https://calendar.example/login', '_blank', 'noopener,noreferrer')
    fireEvent.click(screen.getByRole('button', { name: '我已登录' }))
    await waitFor(() => expect(inbox.resolveInput).toHaveBeenCalledTimes(1))
    expect(inbox.resolveInput.mock.calls[0][0]).toMatchObject({ response: '已登录' })
    open.mockRestore()
  })

  it('reports a failed confirmation and can be deferred', async () => {
    resetInbox([loginItem()])
    inbox.resolveInput = vi.fn(async () => { throw new Error('offline') })
    render(<LoginCard uri="https://alice.example/.data/input-requests/2026/10/16.ttl#in2" />)
    fireEvent.click(screen.getByRole('button', { name: '我已登录' }))
    expect((await screen.findByRole('alert')).textContent).toContain('没提交成功')
    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    expect(screen.getByText(/稍后处理/u)).toBeTruthy()
  })
})
