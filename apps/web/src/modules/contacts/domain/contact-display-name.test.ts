import { describe, expect, it } from 'vitest'
import { contactDisplayName, resolveWebIdDisplayName } from './contact-display-name'

describe('contactDisplayName', () => {
  it('prefers the remark, then the contact name', () => {
    expect(contactDisplayName({ alias: ' 小王 ', name: 'test@localhost:39340' })).toBe('小王')
    expect(contactDisplayName({ alias: '  ', name: 'Test' })).toBe('Test')
    expect(contactDisplayName({ name: '' })).toBe('')
    expect(contactDisplayName(null)).toBe('')
  })
})

describe('resolveWebIdDisplayName', () => {
  const id = 'http://localhost:39340/test/profile/card#me'
  it('uses the contact name when known, else the fallback', () => {
    expect(resolveWebIdDisplayName(id, new Map([[id, '小王']]), 'x')).toBe('小王')
    expect(resolveWebIdDisplayName(id, new Map(), (v) => `fb:${v}`)).toBe(`fb:${id}`)
  })
})
