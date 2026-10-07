import { describe, expect, it } from 'vitest'
import { contactResource } from '@undefineds.co/models'
import { DEFAULT_SECRETARY_CONTACT_ID, isDefaultSecretaryContactId } from './default-secretary'

describe('default-secretary', () => {
  it('derives the same id as the chat default secretary contact', () => {
    expect(DEFAULT_SECRETARY_CONTACT_ID).toBe(contactResource.buildId({ id: '__secretary__' }))
  })

  it('identifies the default secretary and rejects every other id', () => {
    expect(isDefaultSecretaryContactId(DEFAULT_SECRETARY_CONTACT_ID)).toBe(true)
    expect(isDefaultSecretaryContactId(contactResource.buildId({ id: 'someone-else' }))).toBe(false)
    expect(isDefaultSecretaryContactId(null)).toBe(false)
    expect(isDefaultSecretaryContactId(undefined)).toBe(false)
    expect(isDefaultSecretaryContactId('')).toBe(false)
  })
})
