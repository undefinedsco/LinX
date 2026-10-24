import { describe, expect, it } from 'vitest'

import {
  createStructuredSubjectCreationState,
  planStructuredSubjectCreation,
  projectStructuredSubjectCreationFooterModel,
  projectStructuredSubjectCreationReset,
  projectStructuredSubjectCreationSettled,
  projectStructuredSubjectCreationSubmitted,
  structuredSubjectDraftFromName,
} from './structured-subject-creation-model'

describe('structured-subject-creation-model', () => {
  it('stages a card named by the person and resets with the document', () => {
    const initial = createStructuredSubjectCreationState()
    expect(initial).toEqual({ pendingSubjects: [] })

    const plan = planStructuredSubjectCreation({
      classScope: 'udfs:Task',
      existingSubjects: [],
      pendingSubjects: initial.pendingSubjects,
      subjectDraft: structuredSubjectDraftFromName('  我的 新卡片 '),
    })
    expect(plan).toEqual({
      kind: 'create',
      subject: '#我的_新卡片',
      typePredicate: 'rdf:type',
      typeValues: ['udfs:Task'],
    })

    const submitted = projectStructuredSubjectCreationSubmitted({ current: initial, plan })
    expect(submitted).toEqual({ pendingSubjects: ['#我的_新卡片'] })
    expect(projectStructuredSubjectCreationReset(submitted)).toEqual(initial)
  })

  it('refuses an empty name, a taken name and a table without a class', () => {
    expect(planStructuredSubjectCreation({
      classScope: 'udfs:Task', existingSubjects: [], pendingSubjects: [], subjectDraft: structuredSubjectDraftFromName('   '),
    })).toEqual({ kind: 'noop', reason: 'empty-subject' })
    expect(planStructuredSubjectCreation({
      classScope: 'udfs:Task', existingSubjects: ['#A'], pendingSubjects: [], subjectDraft: structuredSubjectDraftFromName('A'),
    })).toEqual({ kind: 'noop', reason: 'duplicate-subject' })
    expect(planStructuredSubjectCreation({
      classScope: null, existingSubjects: [], pendingSubjects: [], subjectDraft: '#A',
    })).toEqual({ kind: 'noop', reason: 'missing-class' })
  })

  it('projects the + 卡片 footer without engineering words', () => {
    expect(projectStructuredSubjectCreationFooterModel({ classScope: 'udfs:Task' })).toEqual({
      disabled: false,
      title: '新增一张卡片',
      buttonAriaLabel: '+ 卡片',
      buttonLabel: '卡片',
    })
    expect(projectStructuredSubjectCreationFooterModel({ classScope: null })).toEqual({
      disabled: true,
      title: '先选一个类型再新增卡片',
      buttonAriaLabel: '+ 卡片',
      buttonLabel: '卡片',
    })
  })

  it('drops pending subjects once the projection lists them', () => {
    const current = { pendingSubjects: ['#A', '#B'] }

    expect(projectStructuredSubjectCreationSettled(current, ['#A']).pendingSubjects).toEqual(['#B'])
    expect(projectStructuredSubjectCreationSettled(current, ['#C'])).toBe(current)
  })
})
