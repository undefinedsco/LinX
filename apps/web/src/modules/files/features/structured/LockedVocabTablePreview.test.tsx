import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LockedVocabTablePreview } from './LockedVocabTablePreview'
import type { FilesDetail } from '../../domain/resource/resource-model'

const { mockUseRawTextResource } = vi.hoisted(() => ({
  mockUseRawTextResource: vi.fn(),
}))

vi.mock('../../data/queries', () => ({
  useRawTextResource: (...args: unknown[]) => mockUseRawTextResource(...args),
}))

const termsTurtle = `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix udfs: <https://undefineds.co/vocab/> .

<https://pod.example/.vocab/terms.ttl#status>
  rdf:type udfs:Predicate ;
  rdfs:label "Status" ;
  rdfs:comment "Workflow state for a task." ;
  rdfs:range xsd:string ;
  udfs:status "active" .
`

const vocabTermsFile: FilesDetail = {
  id: 'https://pod.example/.vocab/terms.ttl',
  uri: 'https://pod.example/.vocab/terms.ttl',
  name: 'terms.ttl',
  kind: 'resource',
  semanticKind: 'vocab-terms',
  parentUri: 'https://pod.example/.vocab/',
  mimeType: 'text/turtle',
  size: termsTurtle.length,
  modifiedAt: '2026-06-29T00:00:00.000Z',
  headers: {},
  previewText: null,
}

describe('LockedVocabTablePreview', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: vocabTermsFile.uri,
        content: termsTurtle,
        mimeType: 'text/turtle',
        etag: '"terms-1"',
        headers: { etag: '"terms-1"' },
      },
      isLoading: false,
      error: null,
    })
  })

  it('projects locked vocab terms from raw Turtle and opens a term peek', () => {
    render(<LockedVocabTablePreview file={vocabTermsFile} />)

    expect(screen.getByLabelText('Locked vocab registry viewport')).toBeInTheDocument()
    expect(screen.getByText('词表定义表')).toBeInTheDocument()
    expect(screen.getByText('1 条定义')).toBeInTheDocument()
    expect(screen.getByText('Workflow state for a task.')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'https://pod.example/.vocab/terms.ttl#status' }))
      .toHaveAttribute('aria-label', 'https://pod.example/.vocab/terms.ttl#status')

    fireEvent.click(screen.getAllByRole('button', { name: 'Open term Status' })[1])

    const peek = screen.getByLabelText('Structured term peek')
    expect(within(peek).getByText('定义预览')).toBeInTheDocument()
    expect(within(peek).getByText('Status')).toBeInTheDocument()
  })
})
