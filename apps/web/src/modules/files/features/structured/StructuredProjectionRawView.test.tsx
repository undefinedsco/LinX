import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StructuredProjectionRawView } from './StructuredProjectionRawView'

const rawViewPath = 'src/modules/files/features/structured/StructuredProjectionRawView.tsx'

describe('StructuredProjectionRawView', () => {
  it('keeps raw view copy in a projection model', () => {
    const source = readFileSync(rawViewPath, 'utf8')

    expect(source).toContain("from './structured-projection-raw-view-model'")
    expect(source).toContain('projectStructuredProjectionRawViewChrome')
    expect(source).not.toContain('当前视图文本')
    expect(source).not.toContain('当前筛选、predicate 可见性和待确认更改后的投影视图。')
  })

  it('renders the structured raw projection copy and shared raw text block', () => {
    render(<StructuredProjectionRawView text="@prefix schema: <https://schema.org/> ." />)

    expect(screen.getByText('当前视图文本')).toBeInTheDocument()
    expect(screen.getByText('当前筛选、predicate 可见性和待确认更改后的投影视图。')).toBeInTheDocument()
    expect(screen.getByText('@prefix schema: <https://schema.org/> .')).toBeInTheDocument()
  })
})
