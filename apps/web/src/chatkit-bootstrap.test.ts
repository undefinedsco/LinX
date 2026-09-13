import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('ChatKit browser bootstrap', () => {
  it('does not pin mutable CDN content to a stale integrity hash', () => {
    const html = readFileSync('index.html', 'utf8')

    expect(html).toContain("chatkitScript.crossOrigin = 'anonymous'")
    expect(html).toContain("'/chatkit-cdn/deployments/chatkit/chatkit.js'")
    expect(html).toContain("'https://cdn.platform.openai.com/deployments/chatkit/chatkit.js'")
    expect(html).not.toContain('integrity=')
  })
})
