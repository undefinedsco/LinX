import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SecretaryWelcome, type SecretaryStarterAction } from './SecretaryWelcome'

const starterActions: SecretaryStarterAction[] = [
  { id: 'organize', label: '整理今天的工作', prompt: '帮我整理今天需要推进的工作' },
  { id: 'find', label: '查找空间中的资料', prompt: '帮我查找当前空间中的相关资料' },
  { id: 'plan', label: '规划下一步', prompt: '根据当前上下文规划下一步' },
]

describe('SecretaryWelcome', () => {
  it('shows a restrained welcome, three starter actions, and a visible composer status', () => {
    render(
      <SecretaryWelcome
        starterActions={starterActions}
        composerValue=""
        composerStatus="可以立即开始；对话记录会在空间准备好后同步。"
        onStarterAction={vi.fn()}
        onComposerValueChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '你好，我是 LinX 主理人' })).toBeInTheDocument()
    expect(screen.getByText('我可以帮你整理信息、规划工作，并在当前空间中推进任务。')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /整理今天的工作|查找空间中的资料|规划下一步/ })).toHaveLength(3)
    expect(screen.getByRole('textbox', { name: '给主理人发消息' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('可以立即开始；对话记录会在空间准备好后同步。')

    const welcome = screen.getByTestId('secretary-welcome')
    expect(welcome.className).not.toMatch(/shadow-|backdrop-blur/)

    const composerForm = screen.getByRole('textbox', { name: '给主理人发消息' }).closest('form')
    expect(composerForm?.className).not.toMatch(/border-t/)
  })

  it('delegates starter, draft, and submit interactions through props', () => {
    const onStarterAction = vi.fn()
    const onComposerValueChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <SecretaryWelcome
        starterActions={starterActions}
        composerValue="已有草稿"
        composerStatus="准备就绪"
        onStarterAction={onStarterAction}
        onComposerValueChange={onComposerValueChange}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /整理今天的工作/ }))
    expect(onStarterAction).toHaveBeenCalledWith(starterActions[0])

    fireEvent.change(screen.getByRole('textbox', { name: '给主理人发消息' }), {
      target: { value: '新的请求' },
    })
    expect(onComposerValueChange).toHaveBeenCalledWith('新的请求')

    fireEvent.submit(screen.getByRole('textbox', { name: '给主理人发消息' }).closest('form')!)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
