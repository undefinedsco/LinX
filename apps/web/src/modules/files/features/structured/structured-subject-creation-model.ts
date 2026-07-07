export type StructuredSubjectCreationPlan =
  | { kind: 'noop'; reason: 'missing-class' | 'empty-subject' | 'duplicate-subject' }
  | { kind: 'create'; subject: string; typePredicate: 'rdf:type'; typeValues: string[] }

export type StructuredSubjectCreationState = {
  createSubjectOpen: boolean
  pendingSubjects: string[]
  subjectDraft: string
}

export type StructuredSubjectCreationFooterModel = {
  disabled: boolean
  title: string
  buttonAriaLabel: string
  buttonLabel: string
}

export type StructuredSubjectCreationDialogModel = {
  title: string
  description: string
  subjectInputLabel: string
  cancelLabel: string
  submitLabel: string
}

export function createStructuredSubjectCreationState(): StructuredSubjectCreationState {
  return {
    createSubjectOpen: false,
    pendingSubjects: [],
    subjectDraft: '#NewSubject',
  }
}

export function projectStructuredSubjectCreationReset(
  _current: StructuredSubjectCreationState,
): StructuredSubjectCreationState {
  return createStructuredSubjectCreationState()
}

export function projectStructuredSubjectCreationOpened({
  current,
  existingSubjects,
}: {
  current: StructuredSubjectCreationState
  existingSubjects: readonly string[]
}): StructuredSubjectCreationState {
  return {
    ...current,
    createSubjectOpen: true,
    subjectDraft: getNextStructuredSubjectDraft({
      existingSubjects,
      pendingSubjects: current.pendingSubjects,
    }),
  }
}

export function projectStructuredSubjectCreationOpenPatch({
  current,
  createSubjectOpen,
}: {
  current: StructuredSubjectCreationState
  createSubjectOpen: boolean
}): StructuredSubjectCreationState {
  return {
    ...current,
    createSubjectOpen,
  }
}

export function projectStructuredSubjectCreationDraftPatch({
  current,
  subjectDraft,
}: {
  current: StructuredSubjectCreationState
  subjectDraft: string
}): StructuredSubjectCreationState {
  return {
    ...current,
    subjectDraft,
  }
}

export function projectStructuredSubjectCreationSubmitted({
  current,
  plan,
}: {
  current: StructuredSubjectCreationState
  plan: StructuredSubjectCreationPlan
}): StructuredSubjectCreationState {
  if (plan.kind !== 'create') return current

  return {
    ...current,
    createSubjectOpen: false,
    pendingSubjects: projectStagedStructuredPendingSubjects({
      pendingSubjects: current.pendingSubjects,
      subject: plan.subject,
    }),
  }
}

export function projectStructuredSubjectCreationExistingSubjects(
  projectionRows: readonly { subject: string }[],
): string[] {
  return projectionRows.map((row) => row.subject)
}

export function getNextStructuredSubjectDraft(input: {
  existingSubjects: readonly string[]
  pendingSubjects: readonly string[]
}): string {
  const existingSubjects = new Set([
    ...input.existingSubjects,
    ...input.pendingSubjects,
  ])
  let nextNumber = input.pendingSubjects.length + 1
  let subject = nextNumber === 1 ? '#NewSubject' : `#NewSubject${nextNumber}`
  while (existingSubjects.has(subject)) {
    nextNumber += 1
    subject = `#NewSubject${nextNumber}`
  }
  return subject
}

export function planStructuredSubjectCreation(input: {
  classScope?: string | null
  existingSubjects: readonly string[]
  pendingSubjects: readonly string[]
  subjectDraft: string
}): StructuredSubjectCreationPlan {
  if (!input.classScope) return { kind: 'noop', reason: 'missing-class' }

  const subject = input.subjectDraft.trim()
  if (!subject) return { kind: 'noop', reason: 'empty-subject' }
  if (input.existingSubjects.includes(subject) || input.pendingSubjects.includes(subject)) {
    return { kind: 'noop', reason: 'duplicate-subject' }
  }

  return {
    kind: 'create',
    subject,
    typePredicate: 'rdf:type',
    typeValues: [input.classScope],
  }
}

export function projectStagedStructuredPendingSubjects(input: {
  pendingSubjects: readonly string[]
  subject: string
}): string[] {
  return [...input.pendingSubjects, input.subject]
}

export function canSubmitStructuredSubjectCreation(input: {
  classScope?: string | null
  existingSubjects: readonly string[]
  pendingSubjects: readonly string[]
  subjectDraft: string
}) {
  return planStructuredSubjectCreation(input).kind === 'create'
}

export function projectStructuredSubjectCreationFooterModel({
  classScope,
}: {
  classScope?: string | null
}): StructuredSubjectCreationFooterModel {
  return {
    disabled: !classScope,
    title: classScope ? `在 ${classScope} 中新增 subject` : '先选择 class 再新增 subject',
    buttonAriaLabel: '+ Subject',
    buttonLabel: 'Subject',
  }
}

export function projectStructuredSubjectCreationDialogModel({
  classScope,
}: {
  classScope?: string | null
}): StructuredSubjectCreationDialogModel {
  return {
    title: '新增 subject',
    description: classScope ?? '先选择 class 再新增 subject。',
    subjectInputLabel: 'Subject',
    cancelLabel: '取消',
    submitLabel: '创建条目审批',
  }
}
