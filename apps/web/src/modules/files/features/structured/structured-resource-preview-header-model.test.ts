import { describe, expect, it } from 'vitest'

import {
  projectStructuredCardClassLabels,
  projectStructuredResourcePreviewHeaderModel,
  projectStructuredTableWithoutNameColumn,
} from './structured-resource-preview-header-model'

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
      classScopeButtonLabel: '当前类型：Task definition',
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
      classScopeButtonLabel: '当前类型：Pending Task',
      classScopeDisplayLabel: 'Pending Task',
      classScopeLabel: 'Pending Task',
    })

    expect(projectStructuredResourcePreviewHeaderModel({
      classDefinition: undefined,
      pendingClassScopeProposal: undefined,
      selectedClassName: 'https://schema.org/FallbackTask',
    })).toEqual({
      classScopeButtonLabel: '当前类型：FallbackTask',
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
      classScopeButtonLabel: '选择类型',
      classScopeDisplayLabel: '选择或创建类型',
      classScopeLabel: '选择或创建类型',
    })
  })
})

describe('projectStructuredTableWithoutNameColumn', () => {
  const projection = { predicates: ['rdfs:label', 'udfs:status'] }

  it('drops rdfs:label from the columns of a table, since it is the row name', () => {
    expect(projectStructuredTableWithoutNameColumn(projection, 'https://pod.example/.data/tasks/tasks.ttl').predicates).toEqual(['udfs:status'])
  })

  it('keeps it in vocabulary registries where it is a defined field', () => {
    expect(projectStructuredTableWithoutNameColumn(projection, 'https://pod.example/.vocab/terms.ttl')).toBe(projection)
  })
})

describe('projectStructuredCardClassLabels', () => {
  it('maps class local names to their labels and the scoped class to the table name', () => {
    const classes = new Map([
      ['https://pod.example/.vocab/terms.ttl#Task', { uri: 'x', label: '任务', description: '', status: '' }],
      ['https://pod.example/.vocab/terms.ttl#Note', { uri: 'y', label: ' ', description: '', status: '' }],
    ])

    expect(projectStructuredCardClassLabels({ classes, scopeClassName: 'udfs:Project', scopeLabel: '项目' })).toEqual({
      Task: '任务',
      Project: '项目',
    })
  })
})
