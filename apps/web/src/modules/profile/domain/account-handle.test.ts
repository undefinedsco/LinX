import { describe, expect, it } from 'vitest'
import { accountHandle, profileDocumentUri, providerDomain } from './account-handle'

describe('accountHandle', () => {
  it('shows 名字@提供方 and never the raw WebID', () => {
    expect(accountHandle('https://id.undefineds.co/linzhou/profile/card#me')).toBe('linzhou@undefineds.co')
    expect(accountHandle('https://alice.solidcommunity.net/profile/card#me')).toBe('alice@solidcommunity.net')
  })

  it('says 本机 for a space on this computer', () => {
    expect(accountHandle('http://127.0.0.1:5737/alice/profile/card#me')).toBe('alice@本机')
    expect(accountHandle('http://localhost:5737/profile/card#me')).toBe('me@本机')
  })

  it('handles empty and unparsable input', () => {
    expect(accountHandle('')).toBe('')
    expect(accountHandle('not a url')).toBe('not a url')
  })

  it('finds the organisation part of a host', () => {
    expect(providerDomain('id.undefineds.co')).toBe('undefineds.co')
    expect(providerDomain('a.b.example.co.uk')).toBe('example.co.uk')
  })

  it('points profile/card at the document that holds #me', () => {
    expect(profileDocumentUri('https://x.org/a/profile/card#me')).toBe('https://x.org/a/profile/card')
  })
})
