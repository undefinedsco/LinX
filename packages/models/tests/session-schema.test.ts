import { describe, expect, it } from 'vitest'
import { solidSchema, sessionTable } from '../src'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('session schema', () => {
  it('registers a real session table in the shared schema', () => {
    expect(sessionTable).toBeDefined()
    expect((solidSchema as any).sessionTable).toBe(sessionTable)
  })

  it('uses Pod-backed session fields instead of a stub contract', () => {
    const columns = (sessionTable as any)?._
      ?.columns ?? (sessionTable as any)?.columns

    expect(columns).toBeDefined()
    expect(columns.id).toBeDefined()
    expect(columns.ownerWebId).toBeDefined()
    expect(columns.sessionType).toBeDefined()
    expect(columns.status).toBeDefined()
    expect(columns.tool).toBeDefined()
    expect(columns.tokenUsage).toBeDefined()
    expect(columns.metadata).toBeDefined()
  })

  it('keeps the Pod storage contract explicit in source', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/session/session.schema.ts'),
      'utf8',
    )

    expect(source).toContain("base: '/.data/session/'")
    expect(source).toContain("sparqlEndpoint: '/.data/session/-/sparql'")
    expect(source).toContain("subjectTemplate: '{id}.ttl'")
  })
})
