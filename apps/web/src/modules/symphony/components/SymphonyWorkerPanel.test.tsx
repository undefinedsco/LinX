import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const solidDbState = vi.hoisted(() => ({
  db: { id: 'db' },
  status: 'ready' as 'ready' | 'idle',
}))
const sessionState = vi.hoisted(() => ({
  webId: 'https://alice.example/profile/card#me',
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: solidDbState.db, status: solidDbState.status, error: null }),
}))

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({ session: { info: { webId: sessionState.webId } } }),
}))

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: { selectedChatId: string | null; selectedThreadId: string | null }) => unknown) => selector({
    selectedChatId: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
    selectedThreadId: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
  }),
}))

import { SymphonyWorkerPanel } from './SymphonyWorkerPanel'

describe('SymphonyWorkerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    solidDbState.db = { id: 'db' }
    solidDbState.status = 'ready'
    sessionState.webId = 'https://alice.example/profile/card#me'
  })

  it('reads worker sessions from the shared Pod snapshot surface', async () => {
    const fetchSnapshot = vi.fn(async () => ({
      issues: [],
      tasks: [{ id: 'task-1', title: 'Fix shared runtime adapter' }],
      deliveries: [],
      sessions: [{ id: 'session-1', task: 'task-1', status: 'running', tool: 'symphony:codex', updatedAt: '2026-04-01T06:00:00.000Z' }],
      runs: [],
      runSteps: [],
      evidence: [],
      reports: [],
    }))

    render(<SymphonyWorkerPanel fetchSnapshot={fetchSnapshot} />)
    fireEvent.click(screen.getByText('Worker'))

    expect(await screen.findByText('Fix shared runtime adapter')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)
  })

  it('starts a worker through the Web Symphony service instead of writing Pod rows in the component', async () => {
    const fetchSnapshot = vi.fn(async () => ({
      issues: [],
      tasks: [],
      deliveries: [],
      sessions: [],
      runs: [],
      runSteps: [],
      evidence: [],
      reports: [],
    }))
    const runWorker = vi.fn(async () => ({ status: 'completed' }))

    render(
      <SymphonyWorkerPanel
        fetchSnapshot={fetchSnapshot}
        runWorker={runWorker}
        defaultWorkspacePath="/tmp/linx"
      />,
    )
    fireEvent.click(screen.getByText('Worker'))
    fireEvent.change(screen.getByPlaceholderText('交给 Codex 的目标…'), {
      target: { value: 'Extract shared worker runtime logic' },
    })
    fireEvent.click(screen.getByRole('button', { name: '启动 worker' }))

    await waitFor(() => expect(runWorker).toHaveBeenCalledTimes(1))
    expect(runWorker).toHaveBeenCalledWith(expect.objectContaining({
      db: solidDbState.db,
      webId: 'https://alice.example/profile/card#me',
      objective: 'Extract shared worker runtime logic',
      workspacePath: '/tmp/linx',
      backend: 'codex',
      chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
      thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
    }))
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
  })
})
