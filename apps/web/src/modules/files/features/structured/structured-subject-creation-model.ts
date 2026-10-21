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

/**
 * A row typed in the table is staged as `#名字`, while the projection reports the resolved
 * address (`<document>#名字`, possibly percent-encoded). Both name the same row.
 */
export function structuredSubjectKey(subject: string, documentUri?: string): string {
  const isLocal = subject.startsWith('#') || (documentUri !== undefined && subject.startsWith(`${documentUri}#`))
  if (!isLocal) return subject
  const fragment = subject.slice(subject.indexOf('#') + 1)
  try { return `#${decodeURIComponent(fragment)}` } catch { return `#${fragment}` }
}

/** Drops pending rows whose write has landed (the projection now lists the subject). */
export function projectStructuredSubjectCreationSettled(
  current: StructuredSubjectCreationState,
  existingSubjects: readonly string[],
  documentUri?: string,
): StructuredSubjectCreationState {
  const existing = new Set(existingSubjects.map((subject) => structuredSubjectKey(subject, documentUri)))
  const pendingSubjects = current.pendingSubjects.filter((subject) => !existing.has(structuredSubjectKey(subject, documentUri)))
  return pendingSubjects.length === current.pendingSubjects.length ? current : { ...current, pendingSubjects }
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

/** R6 K6b: the person types a name in the last row; the card's address is made from it. */
export function structuredSubjectDraftFromName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, '_').replace(/[<>"{}|\\^`#]/g, '')
  return cleaned ? `#${cleaned}` : ''
}

export function planStructuredSubjectCreation(input: {
  classScope?: string | null
  documentUri?: string
  existingSubjects: readonly string[]
  pendingSubjects: readonly string[]
  subjectDraft: string
}): StructuredSubjectCreationPlan {
  if (!input.classScope) return { kind: 'noop', reason: 'missing-class' }

  const subject = input.subjectDraft.trim()
  if (!subject) return { kind: 'noop', reason: 'empty-subject' }
  const key = structuredSubjectKey(subject, input.documentUri)
  const taken = [...input.existingSubjects, ...input.pendingSubjects]
  if (taken.some((existing) => structuredSubjectKey(existing, input.documentUri) === key)) {
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
  documentUri?: string
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
    title: classScope ? `在“${classScope}”里新增一行` : '先选一个类型再新增一行',
    buttonAriaLabel: '+ 卡片',
    buttonLabel: '卡片',
  }
}

export function projectStructuredSubjectCreationDialogModel({
  classScope,
}: {
  classScope?: string | null
}): StructuredSubjectCreationDialogModel {
  return {
    title: '新增一行',
    description: classScope ?? '先选一个类型再新增一行。',
    subjectInputLabel: 'Subject',
    cancelLabel: '取消',
    submitLabel: '创建条目审批',
  }
}
