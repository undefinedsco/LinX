import { describe, expect, it } from 'vitest'
import { sharedItemsFromListing } from './shared-with-me'

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
