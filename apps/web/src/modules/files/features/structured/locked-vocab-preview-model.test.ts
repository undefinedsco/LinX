import { describe, expect, it } from 'vitest'

import { projectLockedVocabPreviewChrome } from './locked-vocab-preview-model'

describe('locked vocab preview model', () => {
  it('projects preview chrome for term, shape, and namespace registries', () => {
    expect(projectLockedVocabPreviewChrome({
      registryKind: 'terms',
      registryRowCount: 2,
    })).toEqual({
      viewport: { ariaLabel: 'Locked vocab registry viewport' },
      header: {
        title: '词表定义表',
        countLabel: '2 条定义',
        readOnlyNote: '定义表只读；修改通过待确认提案进入审批。',
        badge: { label: '只读' },
      },
    })

    expect(projectLockedVocabPreviewChrome({
      registryKind: 'shapes',
      registryRowCount: 1,
    }).header.countLabel).toBe('1 条规则')

    expect(projectLockedVocabPreviewChrome({
      registryKind: 'namespaces',
      registryRowCount: 3,
    }).header).toMatchObject({
      title: '命名空间表',
      countLabel: '3 个命名空间',
    })
  })
})
