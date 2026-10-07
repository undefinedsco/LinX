import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectContextDialog } from './ProjectContextDialog'

const mocked = vi.hoisted(() => ({
  readProjectContext: vi.fn(),
  writeProjectContext: vi.fn(),
}))

vi.mock('../services/project-context', () => ({
  emptyProjectContext: (workspace: string) => ({
    workspace,
    instructions: '',
    memoryEnabled: true,
    memories: [],
    updatedAt: new Date(0).toISOString(),
  }),
  readProjectContext: mocked.readProjectContext,
  writeProjectContext: mocked.writeProjectContext,
}))

describe('ProjectContextDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.readProjectContext.mockResolvedValue({
      workspace: 'https://pod.example/workspaces/project-a/',
      instructions: '引用项目文件。',
      memoryEnabled: true,
      memories: [{ id: 'memory-1', text: '发布日是周五。', createdAt: '2026-08-11T00:00:00.000Z' }],
      updatedAt: '2026-08-11T00:00:00.000Z',
    })
    mocked.writeProjectContext.mockImplementation(async ({ context }) => context)
  })

  it('loads transparent workspace context and persists edited instructions and memories', async () => {
    render(<ProjectContextDialog
      open
      onOpenChange={vi.fn()}
      workspaceUri="https://pod.example/workspaces/project-a/"
      db={{} as any}
    />)

    expect(await screen.findByDisplayValue('引用项目文件。')).toBeInTheDocument()
    expect(screen.getByText('发布日是周五。')).toBeInTheDocument()
    expect(screen.getByText('https://pod.example/workspaces/project-a/')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('引用项目文件。'), { target: { value: '只引用已绑定的项目文件。' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '启用项目记忆' }))
    fireEvent.change(screen.getByPlaceholderText('添加一条项目记忆'), { target: { value: '使用简体中文。' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目记忆' }))
    fireEvent.click(screen.getByRole('button', { name: '保存上下文' }))

    await waitFor(() => expect(mocked.writeProjectContext).toHaveBeenCalledWith({
      db: expect.anything(),
      previous: expect.objectContaining({
        workspace: 'https://pod.example/workspaces/project-a/',
        instructions: '引用项目文件。',
        memories: [expect.objectContaining({ id: 'memory-1' })],
      }),
      context: expect.objectContaining({
        workspace: 'https://pod.example/workspaces/project-a/',
        instructions: '只引用已绑定的项目文件。',
        memoryEnabled: false,
        memories: expect.arrayContaining([
          expect.objectContaining({ text: '发布日是周五。' }),
          expect.objectContaining({ text: '使用简体中文。' }),
        ]),
      }),
    }))
  })

  it('shows a recoverable read error without replacing it with an empty saved context', async () => {
    mocked.readProjectContext.mockRejectedValueOnce(new Error('项目上下文暂时不可读'))
    render(<ProjectContextDialog
      open
      onOpenChange={vi.fn()}
      workspaceUri="https://pod.example/workspaces/project-a/"
      db={{} as any}
    />)

    expect(await screen.findByRole('alert')).toHaveTextContent('项目上下文暂时不可读')
    expect(mocked.writeProjectContext).not.toHaveBeenCalled()
  })

  it('ignores a stale workspace response after the selected workspace changes', async () => {
    let resolveFirst!: (value: any) => void
    mocked.readProjectContext
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({
        workspace: 'https://pod.example/workspaces/project-b/',
        instructions: 'Project B instructions',
        memoryEnabled: true,
        memories: [],
        updatedAt: '2026-08-11T00:00:00.000Z',
      })
    const { rerender } = render(<ProjectContextDialog
      open
      onOpenChange={vi.fn()}
      workspaceUri="https://pod.example/workspaces/project-a/"
      db={{} as any}
    />)

    rerender(<ProjectContextDialog
      open
      onOpenChange={vi.fn()}
      workspaceUri="https://pod.example/workspaces/project-b/"
      db={{} as any}
    />)
    expect(await screen.findByDisplayValue('Project B instructions')).toBeInTheDocument()

    resolveFirst({
      workspace: 'https://pod.example/workspaces/project-a/',
      instructions: 'Stale project A instructions',
      memoryEnabled: true,
      memories: [],
      updatedAt: '2026-08-11T00:00:00.000Z',
    })
    await Promise.resolve()

    expect(screen.queryByDisplayValue('Stale project A instructions')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Project B instructions')).toBeInTheDocument()
  })
})
