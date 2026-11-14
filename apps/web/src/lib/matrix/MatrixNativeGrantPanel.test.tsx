import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatrixNativeGrantPanel } from './MatrixNativeGrantPanel'

const ACCOUNT_ORIGIN = 'https://id.identity.example'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('MatrixNativeGrantPanel', () => {
  it('opens only the verified Account origin, never the Pod', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(
      <MatrixNativeGrantPanel
        accountOrigin={ACCOUNT_ORIGIN}
        busy={false}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('群聊需要一次空间授权')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开账号页' }))

    // Same contract as the existing login/account management helper.
    expect(open).toHaveBeenCalledWith(`${ACCOUNT_ORIGIN}/.account/account/`, '_blank', 'noopener,noreferrer')
    expect(open.mock.calls[0]?.[0]).not.toContain('pod.example')
  })

  it('imports only through the user gesture, never from mount', () => {
    const onImport = vi.fn()
    render(
      <MatrixNativeGrantPanel
        accountOrigin={ACCOUNT_ORIGIN}
        busy={false}
        onImport={onImport}
        onCancel={vi.fn()}
      />,
    )

    expect(onImport).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('访问凭据'), { target: { value: 'sk-pasted' } })
    fireEvent.click(screen.getByRole('button', { name: '使用这个凭据' }))
    expect(onImport).toHaveBeenCalledWith({ apiKey: 'sk-pasted' })
  })

  it('cancels without importing anything', () => {
    const onImport = vi.fn()
    const onCancel = vi.fn()
    render(
      <MatrixNativeGrantPanel
        accountOrigin={ACCOUNT_ORIGIN}
        busy={false}
        onImport={onImport}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onImport).not.toHaveBeenCalled()
  })

  it('offers an ID/secret alternative for the same explicit import', () => {
    const onImport = vi.fn()
    render(
      <MatrixNativeGrantPanel
        accountOrigin={ACCOUNT_ORIGIN}
        busy={false}
        onImport={onImport}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '改用 ID / Secret' }))
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'client-1' } })
    fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'secret-1' } })
    fireEvent.click(screen.getByRole('button', { name: '使用这个凭据' }))
    expect(onImport).toHaveBeenCalledWith({ clientId: 'client-1', clientSecret: 'secret-1' })
  })
})
