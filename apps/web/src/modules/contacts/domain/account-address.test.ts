import { describe, expect, it } from 'vitest'
import { formatAccountAddress, isSameAccount, parseAccountInput, profileDocumentUrl } from './account-address'

describe('account addresses', () => {
  it('shows 名字@提供方 instead of the raw address', () => {
    expect(formatAccountAddress('https://zhouhe.undefineds.co/profile/card#me')).toBe('zhouhe@undefineds.co')
    expect(formatAccountAddress('https://pod.example/alice/profile/card#me')).toBe('alice@pod.example')
    expect(formatAccountAddress('https://linzhou.undefineds.co/agents/__linx__/')).toBe('linx@linzhou.undefineds.co')
    expect(formatAccountAddress('not a url')).toBeNull()
    expect(formatAccountAddress(null)).toBeNull()
  })

  it('accepts a full address, a bare host path and the short form', () => {
    expect(parseAccountInput('https://alice.example/profile/card#me')).toEqual({
      kind: 'ok',
      webId: 'https://alice.example/profile/card#me',
    })
    expect(parseAccountInput('alice.example')).toEqual({ kind: 'ok', webId: 'https://alice.example/profile/card#me' })
    expect(parseAccountInput('songqing@solidcommunity.net')).toEqual({
      kind: 'ok',
      webId: 'https://songqing.solidcommunity.net/profile/card#me',
    })
    expect(parseAccountInput('  ')).toEqual({ kind: 'empty' })
    expect(parseAccountInput('not an account')).toEqual({ kind: 'invalid' })
  })

  it('compares accounts and finds the profile document', () => {
    expect(isSameAccount('https://a.example/profile/card#me', 'https://a.example/profile/card#me/')).toBe(true)
    expect(isSameAccount('https://a.example/x', null)).toBe(false)
    expect(profileDocumentUrl('https://a.example/profile/card#me')).toBe('https://a.example/profile/card')
  })
})
