import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function BrokenChild() {
  throw new Error("Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/Library/Application Support/@linx/xpod.js")
}

describe('ErrorBoundary', () => {
  it('shows a user-facing error without stack or local paths', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    )

    expect(screen.getByText('页面暂时无法显示')).toBeInTheDocument()
    expect(screen.getByText('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')).toBeInTheDocument()
    expect(screen.queryByText(/Require stack|jsonld|Application Support|\/Users/i)).not.toBeInTheDocument()

    consoleError.mockRestore()
  })
})
