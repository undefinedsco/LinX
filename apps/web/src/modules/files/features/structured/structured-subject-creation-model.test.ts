import { describe, expect, it } from 'vitest'

import {
  createStructuredSubjectCreationState,
  planStructuredSubjectCreation,
  projectStructuredSubjectCreationDraftPatch,
  projectStructuredSubjectCreationDialogModel,
  projectStructuredSubjectCreationFooterModel,
  projectStructuredSubjectCreationOpenPatch,
  projectStructuredSubjectCreationOpened,
  projectStructuredSubjectCreationReset,
  projectStructuredSubjectCreationSettled,
  projectStructuredSubjectCreationSubmitted,
} from './structured-subject-creation-model'

describe('structured-subject-creation-model', () => {
  it('projects subject creation dialog state as a single controller state', () => {
    const initial = createStructuredSubjectCreationState()

    expect(initial).toEqual({
      createSubjectOpen: false,
      pendingSubjects: [],
      subjectDraft: '#NewSubject',
    })

    const opened = projectStructuredSubjectCreationOpened({
      current: initial,
      existingSubjects: ['#NewSubject'],
    })
    expect(opened).toEqual({
      createSubjectOpen: true,
      pendingSubjects: [],
      subjectDraft: '#NewSubject2',
    })

    const patched = projectStructuredSubjectCreationDraftPatch({
      current: opened,
      subjectDraft: '#Task',
    })
    expect(patched).toEqual({
      createSubjectOpen: true,
      pendingSubjects: [],
      subjectDraft: '#Task',
    })

    const plan = planStructuredSubjectCreation({
      classScope: 'udfs:Task',
      existingSubjects: [],
      pendingSubjects: patched.pendingSubjects,
      subjectDraft: patched.subjectDraft,
    })
    const submitted = projectStructuredSubjectCreationSubmitted({
      current: patched,
      plan,
    })
    expect(submitted).toEqual({
      createSubjectOpen: false,
      pendingSubjects: ['#Task'],
      subjectDraft: '#Task',
    })

    expect(projectStructuredSubjectCreationOpenPatch({
      current: submitted,
      createSubjectOpen: true,
    })).toEqual({
      createSubjectOpen: true,
      pendingSubjects: ['#Task'],
      subjectDraft: '#Task',
    })
    expect(projectStructuredSubjectCreationReset(submitted)).toEqual(initial)
  })

  it('projects subject creation footer and dialog chrome outside controls', () => {
    expect(projectStructuredSubjectCreationFooterModel({
      classScope: 'udfs:Task',
    })).toEqual({
      disabled: false,
      title: '在“udfs:Task”里新增一行',
      buttonAriaLabel: '+ 卡片',
      buttonLabel: '卡片',
    })

    expect(projectStructuredSubjectCreationFooterModel({
      classScope: null,
    })).toEqual({
      disabled: true,
      title: '先选一个类型再新增一行',
      buttonAriaLabel: '+ 卡片',
      buttonLabel: '卡片',
    })

    expect(projectStructuredSubjectCreationDialogModel({
      classScope: 'udfs:Task',
    })).toEqual({
      title: '新增一行',
      description: 'udfs:Task',
      subjectInputLabel: 'Subject',
      cancelLabel: '取消',
      submitLabel: '创建条目审批',
    })

    expect(projectStructuredSubjectCreationDialogModel({
      classScope: null,
    })).toEqual({
      title: '新增一行',
      description: '先选一个类型再新增一行。',
      subjectInputLabel: 'Subject',
      cancelLabel: '取消',
      submitLabel: '创建条目审批',
    })
  })

  it('drops pending subjects once the projection lists them', () => {
    const current = { createSubjectOpen: false, pendingSubjects: ['#A', '#B'], subjectDraft: '' }

    expect(projectStructuredSubjectCreationSettled(current, ['#A']).pendingSubjects).toEqual(['#B'])
    expect(projectStructuredSubjectCreationSettled(current, ['#C'])).toBe(current)
  })
})
