import { describe, expect, it } from 'vitest'
import { applyOwnerNames, sharedItemsFromListing } from './shared-with-me'

describe('shared with me', () => {
  it('lists what a space shows me, skipping plumbing and public folders', () => {
    const items = sharedItemsFromListing('小林', [
      'https://pod.example/lin/profile/',
      'https://pod.example/lin/settings/',
      'https://pod.example/lin/public/',
      'https://pod.example/lin/.acl',
      'https://pod.example/lin/%E9%A1%B9%E7%9B%AE%E8%AE%A1%E5%88%92.pdf',
      'https://pod.example/lin/Photos/',
      'https://pod.example/lin/Photos/',
    ])
    expect(items).toEqual([
      { ownerName: '小林', uri: 'https://pod.example/lin/Photos/', name: 'Photos', kind: 'folder' },
      { ownerName: '小林', uri: 'https://pod.example/lin/%E9%A1%B9%E7%9B%AE%E8%AE%A1%E5%88%92.pdf', name: '项目计划.pdf', kind: 'file' },
    ])
  })
})

describe('applyOwnerNames', () => {
  it('replaces a stale cached owner name with the current remark', () => {
    const cached = [{ ownerName: 'test@localhost:39340', ownerWebId: 'http://localhost:39340/test/profile/card#me', uri: 'http://localhost:39340/test/a.md', name: 'a.md', kind: 'file' as const }]
    const names = new Map([['http://localhost:39340/test/profile/card#me', '小王']])
    expect(applyOwnerNames(cached, names)[0].ownerName).toBe('小王')
    expect(applyOwnerNames(cached, new Map())[0].ownerName).toBe('test@localhost:39340')
  })
})
