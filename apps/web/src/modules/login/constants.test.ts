import { describe, expect, it } from 'vitest'
import { resolveDefaultCloudIdentityUrl } from './constants'

describe('login identity defaults', () => {
  it('routes the Guangzhou Web deployment to the Guangzhou identity service', () => {
    expect(resolveDefaultCloudIdentityUrl('undefineds-gz.sealosgzg.site'))
      .toBe('https://undefineds-gz-id.sealosgzg.site')
  })

  it('keeps the public cloud identity as the default for other deployments', () => {
    expect(resolveDefaultCloudIdentityUrl('undefineds.co'))
      .toBe('https://id.undefineds.co')
  })

  it('matches hosts case-insensitively', () => {
    expect(resolveDefaultCloudIdentityUrl('UNDEFINEDS-GZ.SEALOSGZG.SITE'))
      .toBe('https://undefineds-gz-id.sealosgzg.site')
  })
})
