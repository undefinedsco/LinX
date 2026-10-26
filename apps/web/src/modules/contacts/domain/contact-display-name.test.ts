import { describe, expect, it } from 'vitest'
import { contactDisplayName } from './contact-display-name'

describe('contactDisplayName', () => {
  it('prefers the remark, then the contact name', () => {
    expect(contactDisplayName({ alias: ' 小王 ', name: 'test@localhost:39340' })).toBe('小王')
    expect(contactDisplayName({ alias: '  ', name: 'Test' })).toBe('Test')
    expect(contactDisplayName({ name: '' })).toBe('')
    expect(contactDisplayName(null)).toBe('')
  })
})
