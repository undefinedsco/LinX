import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  ToolControlCommandSchema,
  ToolCallEventSchema,
  InboxApprovalEventSchema,
  SessionStateEventSchema,
  SidecarEventSchema,
  getSidecarEventVersion,
} from '../src/sidecar/sidecar-events'

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/sidecar-events/', import.meta.url))

function loadFixture(name: string): unknown {
  const raw = readFileSync(join(FIXTURES_DIR, name), 'utf-8')
  return JSON.parse(raw)
}

describe('sidecar event contracts (v1 frozen)', () => {
  test('tool.call v1 fixture parses', () => {
    const evt = loadFixture('tool.call.v1.json')
    expect(() => ToolCallEventSchema.parse(evt)).not.toThrow()
    expect(getSidecarEventVersion(SidecarEventSchema.parse(evt))).toBe(1)
  })

  test('session.state v1 fixture parses', () => {
    const evt = loadFixture('session.state.v1.json')
    expect(() => SessionStateEventSchema.parse(evt)).not.toThrow()
  })

  test('tool.control v1 fixture parses', () => {
    const evt = loadFixture('tool.control.v1.json')
    expect(() => ToolControlCommandSchema.parse(evt)).not.toThrow()
  })

  test('inbox.approval v1 fixture parses', () => {
    const evt = loadFixture('inbox.approval.v1.json')
    expect(() => InboxApprovalEventSchema.parse(evt)).not.toThrow()
  })

  test('v1 strict schemas reject unknown fields', () => {
    const evt = loadFixture('tool.call.v1.json') as any
    evt.extraField = 'nope'
    expect(() => ToolCallEventSchema.parse(evt)).toThrow()
  })
})
