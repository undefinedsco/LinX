import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('ChatKit browser bootstrap', () => {
  it('does not pin mutable CDN content to a stale integrity hash', () => {
    const html = readFileSync('index.html', 'utf8')
    const script = html.match(/<script[\s\S]*?chatkit\/chatkit\.js[\s\S]*?<\/script>/u)?.[0]

    expect(script).toBeDefined()
    expect(script).toContain('crossorigin="anonymous"')
    expect(script).not.toContain('integrity=')
  })
})
