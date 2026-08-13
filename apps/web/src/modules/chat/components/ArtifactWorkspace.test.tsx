import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ArtifactWorkspace } from './ArtifactWorkspace'
import type { ChatArtifactVersion } from '@/modules/files/domain/list/chat-files-projection'

const versions: ChatArtifactVersion[] = [
  {
    id: 'https://pod.example/plan-v2.md',
    uri: 'https://pod.example/plan-v2.md',
    name: 'plan.md',
    kind: 'resource',
    semanticKind: 'markdown',
    parentUri: 'https://pod.example/',
    mimeType: 'text/markdown',
    size: 12,
    modifiedAt: '2026-08-11T02:00:00.000Z',
    sourceLabel: '运行产物',
    versionId: 'message-2:0',
    messageId: 'message-2',
    createdAt: '2026-08-11T02:00:00.000Z',
  },
  {
    id: 'https://pod.example/plan-v1.md',
    uri: 'https://pod.example/plan-v1.md',
    name: 'plan.md',
    kind: 'resource',
    semanticKind: 'markdown',
    parentUri: 'https://pod.example/',
    mimeType: 'text/markdown',
    size: 12,
    modifiedAt: '2026-08-11T01:00:00.000Z',
    sourceLabel: '运行产物',
    versionId: 'message-1:0',
    messageId: 'message-1',
    createdAt: '2026-08-11T01:00:00.000Z',
  },
]

describe('ArtifactWorkspace', () => {
  it('loads protected Pod artifacts, switches versions and continues from the selected version', async () => {
    const authFetch = vi.fn(async (input: RequestInfo | URL) => new Response(
      String(input).includes('v2') ? '# Version two' : '# Version one',
      { status: 200, headers: { 'Content-Type': 'text/markdown' } },
    ))
    const onContinue = vi.fn()

    render(<ArtifactWorkspace versions={versions} authFetch={authFetch as typeof fetch} onContinue={onContinue} onSaveVersion={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'Version two' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /版本 1/u }))
    expect(await screen.findByRole('heading', { name: 'Version one' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续修改' }))

    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ versionId: 'message-1:0' }))
    expect(authFetch).toHaveBeenCalledWith('https://pod.example/plan-v1.md')
  })

  it('shows a recoverable error when an artifact cannot be read', async () => {
    const authFetch = vi.fn(async () => new Response('', { status: 403 }))
    render(<ArtifactWorkspace versions={versions.slice(0, 1)} authFetch={authFetch as typeof fetch} onContinue={vi.fn()} onSaveVersion={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('HTTP 403'))
  })

  it('rejects oversized previews from metadata before buffering the response body', async () => {
    const cancel = vi.fn(async () => undefined)
    const body = { cancel } as unknown as ReadableStream<Uint8Array>
    const authFetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'Content-Type': 'text/markdown', 'Content-Length': String(5 * 1024 * 1024 + 1) }),
      body,
    } as Response))
    render(<ArtifactWorkspace versions={versions.slice(0, 1)} authFetch={authFetch as typeof fetch} onContinue={vi.fn()} onSaveVersion={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('超过 5 MB'))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('edits text artifacts and saves a new version without overwriting the source', async () => {
    const authFetch = vi.fn(async () => new Response('# Version two', { status: 200, headers: { 'Content-Type': 'text/markdown' } }))
    const onSaveVersion = vi.fn(async () => undefined)
    render(<ArtifactWorkspace versions={versions.slice(0, 1)} authFetch={authFetch as typeof fetch} onContinue={vi.fn()} onSaveVersion={onSaveVersion} />)

    await screen.findByRole('heading', { name: 'Version two' })
    fireEvent.click(screen.getByRole('button', { name: '编辑产物' }))
    fireEvent.change(screen.getByRole('textbox', { name: '产物编辑器' }), { target: { value: '# Version three' } })
    fireEvent.click(screen.getByRole('button', { name: '保存新版本' }))

    await waitFor(() => expect(onSaveVersion).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'https://pod.example/plan-v2.md' }),
      '# Version three',
    ))
  })
})
