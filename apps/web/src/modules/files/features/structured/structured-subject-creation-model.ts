export type StructuredSubjectCreationPlan =
  | { kind: 'noop'; reason: 'missing-class' | 'empty-subject' | 'duplicate-subject' }
  | { kind: 'create'; subject: string; typePredicate: 'rdf:type'; typeValues: string[] }

export type StructuredSubjectCreationState = {
  pendingSubjects: string[]
}

export type StructuredSubjectCreationFooterModel = {
  disabled: boolean
  title: string
  buttonAriaLabel: string
  buttonLabel: string
}

export function createStructuredSubjectCreationState(): StructuredSubjectCreationState {
  return { pendingSubjects: [] }
}

export function projectStructuredSubjectCreationReset(
  _current: StructuredSubjectCreationState,
): StructuredSubjectCreationState {
  return createStructuredSubjectCreationState()
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
    title: classScope ? '新增一张卡片' : '先选一个类型再新增卡片',
    buttonAriaLabel: '+ 卡片',
    buttonLabel: '卡片',
  }
}
