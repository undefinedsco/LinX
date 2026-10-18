import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { diffMethod, hasMethodChanged } from './domain/method'

const mockMutateAsync = vi.fn().mockResolvedValue(undefined)
const mockAgents = vi.hoisted(() => ({
  list: [] as Array<{ id: string; name: string; instructions: string; isDefault: boolean; model: string | null }>,
}))

vi.mock('./data/agents', () => ({
  useMyAgents: () => ({ agents: mockAgents.list, isLoading: false }),
  useSaveAgentMethod: () => ({ mutateAsync: mockMutateAsync, isPending: false, error: null }),
}))

import { useMyAIStore } from './app/store'
import { useOpenAgentMethod } from './app/open-method'
import { AgentMethodDialogHost } from './features/AgentMethodDialog'

function Opener({ agentId }: { agentId: string }) {
  const open = useOpenAgentMethod()
  return <button type="button" onClick={() => open(agentId)}>打开方法</button>
}

describe('method dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgents.list = [
      { id: 'agents/__secretary__/', name: 'LinX 助手', instructions: '花钱超过 500 元先问我', isDefault: true, model: null },
      { id: 'agents/helper/', name: '活动小助手', instructions: '', isDefault: false, model: null },
    ]
    useMyAIStore.setState({ methodDialogAgentId: null })
  })

  it('opens the editor for the chosen assistant from useOpenAgentMethod, without navigating', async () => {
    render(<><Opener agentId="agents/helper/" /><AgentMethodDialogHost /></>)

    expect(screen.queryByTestId('agent-method-dialog')).toBeNull()
    fireEvent.click(screen.getByText('打开方法'))

    expect(await screen.findByTestId('agent-method-dialog')).toBeTruthy()
    expect(await screen.findByText('活动小助手 · 做事的方法')).toBeTruthy()
  })

  it('says so when the assistant no longer exists', async () => {
    useMyAIStore.setState({ methodDialogAgentId: 'agents/gone/' })
    render(<AgentMethodDialogHost />)

    expect(await screen.findByText('这个助手已经不在了')).toBeTruthy()
  })

  it('shows the change and its scope before saving a method', async () => {
    useMyAIStore.setState({ methodDialogAgentId: 'agents/__secretary__/' })
    render(<AgentMethodDialogHost />)

    expect(await screen.findByText('默认方法 · 这个助手的所有会话都会用')).toBeTruthy()
    expect(screen.getByText(/改方法不会给助手更多权限/)).toBeTruthy()

    // Older free-form methods open under 补充说明, so nothing is lost.
    fireEvent.change(screen.getByLabelText('补充说明'), { target: { value: '花钱超过 300 元先问我' } })
    fireEvent.click(screen.getByRole('button', { name: '保存…' }))

    expect(await screen.findByText('保存“LinX 助手”的方法？')).toBeTruthy()
    expect(screen.getByLabelText('改动').textContent).toContain('删除：5')

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        agentId: 'agents/__secretary__/',
        instructions: '## 补充说明\n花钱超过 300 元先问我',
      })
    })
  })

  it('lets the person discard an unsaved edit', async () => {
    useMyAIStore.setState({ methodDialogAgentId: 'agents/__secretary__/' })
    render(<AgentMethodDialogHost />)

    fireEvent.change(await screen.findByLabelText('补充说明'), { target: { value: '改了' } })
    fireEvent.click(screen.getByRole('button', { name: '放弃' }))

    expect((screen.getByLabelText('补充说明') as HTMLTextAreaElement).value).toBe('花钱超过 500 元先问我')
    expect(screen.getByText('已保存')).toBeTruthy()
  })
})

describe('structured method editing', () => {
  beforeEach(() => {
    mockMutateAsync.mockClear()
    mockAgents.list = [{ id: 'agents/__secretary__/', name: 'LinX 助手', instructions: '', isDefault: true, model: null }]
    useMyAIStore.setState({ methodDialogAgentId: 'agents/__secretary__/' })
  })

  it('writes goal, criteria and exceptions as one method', async () => {
    render(<AgentMethodDialogHost />)

    fireEvent.change(await screen.findByLabelText('目标'), { target: { value: '省时间、少维护' } })
    fireEvent.click(screen.getByRole('button', { name: '添加一条' }))
    fireEvent.change(screen.getByLabelText('判断标准 1'), { target: { value: '先找现成的办法' } })
    fireEvent.change(screen.getByLabelText('例外'), { target: { value: '紧急变化可以直接通知' } })
    fireEvent.click(screen.getByRole('button', { name: '保存…' }))
    fireEvent.click(await screen.findByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        agentId: 'agents/__secretary__/',
        instructions: '## 目标\n省时间、少维护\n\n## 判断标准\n- 先找现成的办法\n\n## 例外\n紧急变化可以直接通知',
      })
    })
  })
})
