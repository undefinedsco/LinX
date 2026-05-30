import { describe, expect, it } from 'vitest'

import { isLocalAccessHostname, isLocalAccessUrl } from './local-access-url'

describe('local access URL helpers', () => {
  it.each([
    'localhost',
    '[::1]',
    'alice.local',
    '127.0.0.1',
    '10.0.0.8',
    '172.16.0.2',
    '172.31.255.254',
    '192.168.1.23',
    '169.254.10.5',
  ])('classifies %s as a local access hostname', (hostname) => {
    expect(isLocalAccessHostname(hostname)).toBe(true)
  })

  it.each([
    'id.undefineds.co',
    'node-0000.undefineds.co',
    '172.32.0.1',
    '192.169.0.1',
    '8.8.8.8',
  ])('does not classify %s as a local access hostname', (hostname) => {
    expect(isLocalAccessHostname(hostname)).toBe(false)
  })

  it('classifies full URLs using the same hostname rules', () => {
    expect(isLocalAccessUrl('http://192.168.1.23:5737/')).toBe(true)
    expect(isLocalAccessUrl('https://node-0000.undefineds.co/')).toBe(false)
    expect(isLocalAccessUrl('not a url')).toBe(false)
  })
})
