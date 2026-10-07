import { describe, expect, it } from 'vitest'

import { projectStructuredCards } from './structured-projections'

describe('projectStructuredCards', () => {
  it('does not repeat the class URI as a card summary when no description exists', () => {
    const [card] = projectStructuredCards({
      prefixes: {},
      predicates: ['title', 'rdf:type'],
      rows: [{
        subject: '#Workspace',
        cells: [
          { predicate: 'title', values: ['"Files"'] },
          { predicate: 'rdf:type', values: ['https://undefineds.co/vocab/Workspace'] },
        ],
      }],
      warnings: [],
    })

    expect(card).toMatchObject({
      title: 'Files',
      className: 'Workspace',
      summary: '',
    })
  })

  it('uses a real description as the card summary', () => {
    const [card] = projectStructuredCards({
      prefixes: {},
      predicates: ['schema:description'],
      rows: [{
        subject: '#Workspace',
        cells: [{ predicate: 'schema:description', values: ['"Primary workspace"'] }],
      }],
      warnings: [],
    })

    expect(card?.summary).toBe('Primary workspace')
  })
})
