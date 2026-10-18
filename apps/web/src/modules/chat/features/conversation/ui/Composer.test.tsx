import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AssistantRuntimeProvider, ThreadPrimitive, useLocalRuntime } from '@assistant-ui/react'
import { Composer } from './Composer'
import { ComposerToolsContext } from './composer-tools'
import { useWorkbenchDialogs } from '../workbench-dialogs'

const tools = { webSearch: false, setWebSearch: vi.fn(), imageGeneration: false, setImageGeneration: vi.fn() }

function Harness() {
  const runtime = useLocalRuntime({ run: async () => ({ content: [{ type: 'text', text: 'ok' }] }) })
  return (
    <ComposerToolsContext.Provider value={tools}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root><Composer /></ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </ComposerToolsContext.Provider>
  )
}

describe('Composer tools', () => {
  beforeEach(() => {
    // cmdk needs these in jsdom.
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
    Element.prototype.scrollIntoView ??= () => undefined
    vi.clearAllMocks()
    useWorkbenchDialogs.getState().close()
  })

  it('toggles 生成图片 and opens 截图记录 / 语音对话', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('生成图片'))
    expect(tools.setImageGeneration).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByLabelText('截图记录'))
    expect(useWorkbenchDialogs.getState().active).toBe('capture')
    fireEvent.click(screen.getByLabelText('语音对话'))
    expect(useWorkbenchDialogs.getState().active).toBe('voice')
  })

  it('opens the / menu, filters it, and runs a command on Enter', () => {
    render(<Harness />)
    const input = screen.getByLabelText('消息') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '/' } })
    expect(screen.getByText('生成图片', { selector: '[cmdk-item]' })).toBeInTheDocument()
    expect(screen.getByText('分享这段聊天')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '/分享' } })
    expect(screen.queryByText('生成图片', { selector: '[cmdk-item]' })).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useWorkbenchDialogs.getState().active).toBe('share')
    expect(input.value).toBe('')
  })

  it('picks 生成图片 from the menu by click', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('消息'), { target: { value: '/图片' } })
    fireEvent.click(screen.getByText('生成图片', { selector: '[cmdk-item]' }))
    expect(tools.setImageGeneration).toHaveBeenCalledWith(true)
  })
})

describe('Composer / menu 项目记忆', () => {
  it('hides 项目记忆 when the chat has no workspace', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('消息'), { target: { value: '/' } })
    expect(screen.getByText('查看附件')).toBeTruthy()
    expect(screen.queryByText('项目记忆')).toBeNull()
  })
})
