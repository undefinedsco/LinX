import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  StructuredProjectionWarningsAlert,
  StructuredShapeWarningsAlert,
  StructuredSourceUnavailableAlert,
} from './StructuredProjectionAlerts'

const alertsPath = 'src/modules/files/features/structured/StructuredProjectionAlerts.tsx'

describe('StructuredProjectionAlerts', () => {
  it('keeps alert copy and availability projection in a model', () => {
    const source = readFileSync(alertsPath, 'utf8')

    expect(source).toContain("from './structured-projection-alerts-model'")
    expect(source).toContain('projectStructuredSourceUnavailableAlert')
    expect(source).toContain('projectStructuredShapeWarningsAlert')
    expect(source).toContain('projectStructuredProjectionWarningsAlert')
    expect(source).not.toContain('warnings.length === 0')
    expect(source).not.toContain('warnings[0]')
    expect(source).not.toContain('完整原始内容暂时不可用')
    expect(source).not.toContain('个校验提醒')
  })

  it('renders source unavailable copy for table and raw contexts', () => {
    const { rerender } = render(<StructuredSourceUnavailableAlert />)

    expect(screen.getByText('完整原始内容暂时不可用，不能解析结构化表。')).toBeInTheDocument()

    rerender(<StructuredSourceUnavailableAlert compact />)

    expect(screen.getByText('完整原始内容暂时不可用。')).toBeInTheDocument()
  })

  it('renders shape warning count and first warning message', () => {
    render(<StructuredShapeWarningsAlert warnings={[
      { subject: '#Task', predicate: 'schema:name', message: '缺少必填 name' },
      { subject: '#Task', predicate: 'schema:dateCreated', message: 'dateCreated 格式不正确' },
    ]} />)

    expect(screen.getByText('2 个校验提醒')).toBeInTheDocument()
    expect(screen.getByText('缺少必填 name')).toBeInTheDocument()
    expect(screen.queryByText('dateCreated 格式不正确')).not.toBeInTheDocument()
  })

  it('renders projection warnings and hides empty warning groups', () => {
    const { container, rerender } = render(<StructuredProjectionWarningsAlert warnings={['RDF/XML preview requires browser XML support.']} />)

    expect(screen.getByText('RDF/XML preview requires browser XML support.')).toBeInTheDocument()

    rerender(<StructuredProjectionWarningsAlert warnings={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
