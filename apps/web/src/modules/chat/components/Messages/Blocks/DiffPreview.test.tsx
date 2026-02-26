/**
 * DiffPreview - Unit tests
 *
 * Tests unified diff parsing, line number display, and collapse/expand behavior.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiffPreview, DiffPreviewFromText, parseDiffText } from './DiffPreview'
import type { DiffLine } from './DiffPreview'

describe('parseDiffText', () => {
  it('parses simple add/delete/context lines', () => {
    const diff = [
      '-old line',
      '+new line',
      ' context line',
    ].join('\n')

    const result = parseDiffText(diff)
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ type: 'delete', content: 'old line', oldLineNo: 1 })
    expect(result[1]).toMatchObject({ type: 'add', content: 'new line', newLineNo: 1 })
    expect(result[2]).toMatchObject({ type: 'context', content: 'context line', oldLineNo: 2, newLineNo: 2 })
  })

  it('parses unified diff with hunk headers', () => {
    const diff = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -10,3 +10,4 @@',
      ' unchanged',
      '-removed',
      '+added line 1',
      '+added line 2',
    ].join('\n')

    const result = parseDiffText(diff)
    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({ type: 'context', oldLineNo: 10, newLineNo: 10 })
    expect(result[1]).toMatchObject({ type: 'delete', oldLineNo: 11 })
    expect(result[2]).toMatchObject({ type: 'add', newLineNo: 11 })
    expect(result[3]).toMatchObject({ type: 'add', newLineNo: 12 })
  })

  it('skips diff metadata lines', () => {
    const diff = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
    ].join('\n')

    const result = parseDiffText(diff)
    expect(result).toHaveLength(2)
  })

  it('handles multiple hunks', () => {
    const diff = [
      '@@ -1,2 +1,2 @@',
      '-first old',
      '+first new',
      '@@ -20,2 +20,2 @@',
      '-second old',
      '+second new',
    ].join('\n')

    const result = parseDiffText(diff)
    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({ type: 'delete', oldLineNo: 1 })
    expect(result[1]).toMatchObject({ type: 'add', newLineNo: 1 })
    expect(result[2]).toMatchObject({ type: 'delete', oldLineNo: 20 })
    expect(result[3]).toMatchObject({ type: 'add', newLineNo: 20 })
  })
})

describe('DiffPreview component', () => {
  const sampleLines: DiffLine[] = [
    { type: 'context', content: 'line 1', oldLineNo: 1, newLineNo: 1 },
    { type: 'delete', content: 'old line 2', oldLineNo: 2 },
    { type: 'add', content: 'new line 2', newLineNo: 2 },
    { type: 'context', content: 'line 3', oldLineNo: 3, newLineNo: 3 },
  ]

  it('renders file path in header', () => {
    render(<DiffPreview filePath="src/app.ts" lines={sampleLines} />)
    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
  })

  it('renders add/delete counts in header', () => {
    render(<DiffPreview filePath="test.ts" lines={sampleLines} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  it('renders all lines when below threshold', () => {
    render(<DiffPreview filePath="test.ts" lines={sampleLines} collapseThreshold={10} />)
    expect(screen.getByText('line 1')).toBeInTheDocument()
    expect(screen.getByText('old line 2')).toBeInTheDocument()
    expect(screen.getByText('new line 2')).toBeInTheDocument()
    expect(screen.getByText('line 3')).toBeInTheDocument()
  })

  it('collapses when lines exceed threshold', () => {
    const manyLines: DiffLine[] = Array.from({ length: 15 }, (_, i) => ({
      type: 'context' as const,
      content: `line ${i + 1}`,
      oldLineNo: i + 1,
      newLineNo: i + 1,
    }))

    render(<DiffPreview filePath="test.ts" lines={manyLines} collapseThreshold={10} />)
    // Should show expand button
    expect(screen.getByText(/展开 5 行变更/)).toBeInTheDocument()
    // First 10 lines visible
    expect(screen.getByText('line 1')).toBeInTheDocument()
    expect(screen.getByText('line 10')).toBeInTheDocument()
    // Line 15 should not be visible
    expect(screen.queryByText('line 15')).not.toBeInTheDocument()
  })

  it('expands collapsed diff on click', () => {
    const manyLines: DiffLine[] = Array.from({ length: 15 }, (_, i) => ({
      type: 'context' as const,
      content: `line ${i + 1}`,
      oldLineNo: i + 1,
      newLineNo: i + 1,
    }))

    render(<DiffPreview filePath="test.ts" lines={manyLines} collapseThreshold={10} />)
    fireEvent.click(screen.getByText(/展开 5 行变更/))
    // All lines should now be visible
    expect(screen.getByText('line 15')).toBeInTheDocument()
    // Collapse button should appear
    expect(screen.getByText('折叠')).toBeInTheDocument()
  })

  it('shows + prefix for added lines and - for deleted', () => {
    const { container } = render(<DiffPreview filePath="test.ts" lines={sampleLines} />)
    const plusSigns = container.querySelectorAll('span')
    const texts = Array.from(plusSigns).map((el) => el.textContent)
    expect(texts).toContain('+')
    expect(texts).toContain('-')
  })
})

describe('DiffPreviewFromText', () => {
  it('parses and renders diff text', () => {
    const diffText = '-old\n+new'
    render(<DiffPreviewFromText filePath="test.ts" diffText={diffText} />)
    expect(screen.getByText('old')).toBeInTheDocument()
    expect(screen.getByText('new')).toBeInTheDocument()
  })
})
