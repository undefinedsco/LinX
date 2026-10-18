import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: { active: true, hits: [] as unknown[], note: null as string | null },
  open: vi.fn(),
}))

vi.mock('./useFilesBodySearch', () => ({
  useFilesBodySearch: () => mocks.state,
  useOpenBodyHit: () => mocks.open,
}))

import { FilesBodySearchSection, splitSnippet } from './FilesBodySearchSection'

describe('FilesBodySearchSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state = { active: true, hits: [], note: null }
  })

  it('splits a snippet around the match', () => {
    expect(splitSnippet('给志愿者排班时', '排班')).toEqual(['给志愿者', '排班', '时'])
    expect(splitSnippet('abc', 'x')).toEqual(['abc', '', ''])
  })

  it('shows snippet, why it matched, the coverage note, and opens at the line', () => {
    mocks.state = {
      active: true,
      note: '还有 3 个文件的正文没建索引，只按名字找',
      hits: [{ uri: 'u1', title: '纪要.md', snippet: '给志愿者排班时', matched: '排班', reason: '正文里有 “排班”', line: 4, quote: '给志愿者排班时' }],
    }
    render(<FilesBodySearchSection query="排班" />)
    const section = screen.getByRole('region', { name: '正文里的结果' })
    expect(section).toHaveTextContent('还有 3 个文件的正文没建索引，只按名字找')
    expect(section).toHaveTextContent('正文里有 “排班” · 第 4 行')
    fireEvent.click(screen.getByText('纪要.md'))
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ uri: 'u1', line: 4 }))
  })

  it('renders nothing without a query', () => {
    mocks.state = { active: false, hits: [], note: null }
    const { container } = render(<FilesBodySearchSection query="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
