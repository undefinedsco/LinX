import { describe, expect, it } from 'vitest'
import { sessionResource, solidResources, solidSchema, sessionTable } from '../src'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('session schema', () => {
  it('registers a real session table in the shared schema', () => {
    expect(sessionTable).toBeDefined()
    expect((solidSchema as any).sessionTable).toBe(sessionTable)
    expect(sessionResource).toBe(sessionTable)
    expect((solidResources as any).sessionResource).toBe(sessionResource)
  })

  it('uses Pod-backed session fields instead of a stub contract', () => {
    const columns = (sessionTable as any)?._
      ?.columns ?? (sessionTable as any)?.columns

    expect(columns).toBeDefined()
    expect(columns.id).toBeDefined()
    expect(columns.ownerWebId).toBeDefined()
    expect(columns.chat).toBeDefined()
    expect(columns.thread).toBeDefined()
    expect(columns.chatId).toBeUndefined()
    expect(columns.threadId).toBeUndefined()
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

    expect(source).toContain("base: '/.data/sessions/'")
    expect(source).toContain("sparqlEndpoint: '/.data/sessions/-/sparql'")
    expect(source).toContain("subjectTemplate: '{yyyy}/{MM}.ttl#{id}'")
  })
})
