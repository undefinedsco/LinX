import { describe, expect, it } from 'vitest'
import { STRUCTURED_OPTION_TONES, structuredOptionTone } from './structured-option-color'

describe('structuredOptionTone', () => {
  it('is deterministic and ignores case, spacing and the pending * suffix', () => {
    expect(structuredOptionTone('Done')).toBe(structuredOptionTone('Done'))
    expect(structuredOptionTone('Done')).toBe(structuredOptionTone(' done* '))
  })
  it('spreads different values over the palette with dark-mode classes', () => {
    const tones = new Set(['todo', 'doing', 'done', 'blocked', 'idea', 'later'].map((v) => structuredOptionTone(v)))
    expect(tones.size).toBeGreaterThan(2)
    for (const tone of STRUCTURED_OPTION_TONES) expect(tone.chip).toContain('dark:')
  })
})
