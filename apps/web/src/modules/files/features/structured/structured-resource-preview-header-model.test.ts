import { describe, expect, it } from 'vitest'

import { projectStructuredResourcePreviewHeaderModel } from './structured-resource-preview-header-model'

describe('projectStructuredResourcePreviewHeaderModel', () => {
  it('projects selected class labels from definition, pending proposal, or local URI fallback', () => {
    expect(projectStructuredResourcePreviewHeaderModel({
      classDefinition: {
        uri: 'https://schema.org/Task',
        label: 'Task definition',
        description: 'A task class.',
        status: 'stable',
      },
      pendingClassScopeProposal: {
        label: 'Pending Task',
        uri: 'https://schema.org/PendingTask',
      },
      selectedClassName: 'https://schema.org/Task',
    })).toEqual({
      classScopeButtonLabel: '当前 class：Task definition',
      classScopeDisplayLabel: 'Task definition',
      classScopeLabel: 'Task definition',
    })

    expect(projectStructuredResourcePreviewHeaderModel({
      classDefinition: undefined,
      pendingClassScopeProposal: {
        label: 'Pending Task',
        uri: 'https://schema.org/PendingTask',
      },
      selectedClassName: 'https://schema.org/PendingTask',
    })).toEqual({
      classScopeButtonLabel: '当前 class：Pending Task',
      classScopeDisplayLabel: 'Pending Task',
      classScopeLabel: 'Pending Task',
    })

    expect(projectStructuredResourcePreviewHeaderModel({
      classDefinition: undefined,
      pendingClassScopeProposal: undefined,
      selectedClassName: 'https://schema.org/FallbackTask',
    })).toEqual({
      classScopeButtonLabel: '当前 class：FallbackTask',
      classScopeDisplayLabel: 'FallbackTask',
      classScopeLabel: 'FallbackTask',
    })
  })

  it('projects empty class scope copy without leaking fallback decisions into the preview renderer', () => {
    expect(projectStructuredResourcePreviewHeaderModel({
      classDefinition: undefined,
      pendingClassScopeProposal: undefined,
      selectedClassName: null,
    })).toEqual({
      classScopeButtonLabel: '选择 class',
      classScopeDisplayLabel: '选择或创建 class',
      classScopeLabel: '选择或创建 class',
    })
  })
})
