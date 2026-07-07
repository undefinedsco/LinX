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
      title: '在 udfs:Task 中新增 subject',
      buttonAriaLabel: '+ Subject',
      buttonLabel: 'Subject',
    })

    expect(projectStructuredSubjectCreationFooterModel({
      classScope: null,
    })).toEqual({
      disabled: true,
      title: '先选择 class 再新增 subject',
      buttonAriaLabel: '+ Subject',
      buttonLabel: 'Subject',
    })

    expect(projectStructuredSubjectCreationDialogModel({
      classScope: 'udfs:Task',
    })).toEqual({
      title: '新增 subject',
      description: 'udfs:Task',
      subjectInputLabel: 'Subject',
      cancelLabel: '取消',
      submitLabel: '创建条目审批',
    })

    expect(projectStructuredSubjectCreationDialogModel({
      classScope: null,
    })).toEqual({
      title: '新增 subject',
      description: '先选择 class 再新增 subject。',
      subjectInputLabel: 'Subject',
      cancelLabel: '取消',
      submitLabel: '创建条目审批',
    })
  })
})
