import type { StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'

const ghostActionClassName = 'rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/70'
const primaryActionClassName = 'rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90'

export type StructuredSubjectPeekAction =
  | { kind: 'resource-sidecar' }
  | { kind: 'copy-external'; label: string; variant: 'ghost'; className: string }
  | { kind: 'cancel'; label: string; variant: 'ghost'; className: string }
  | { kind: 'open-source'; label: string; variant: 'ghost'; className: string }
  | { kind: 'close'; label: string; variant: 'primary'; className: string }
  | { kind: 'primary-open'; label: string; variant: 'primary'; className: string }

function structuredSubjectPeekActionClassName(variant: 'ghost' | 'primary') {
  return variant === 'primary' ? primaryActionClassName : ghostActionClassName
}

function structuredSubjectPeekButtonAction<
  T extends Exclude<StructuredSubjectPeekAction, { kind: 'resource-sidecar' }>,
>(action: Omit<T, 'className'>): T {
  return {
    ...action,
    className: structuredSubjectPeekActionClassName(action.variant),
  } as T
}

export function projectStructuredSubjectPeekActions({
  peek,
  targetIsCurrentFile,
}: {
  peek: StructuredSubjectPeek
  targetIsCurrentFile: boolean
}): StructuredSubjectPeekAction[] {
  if (!peek) return []
  if (targetIsCurrentFile) {
    return [structuredSubjectPeekButtonAction({ kind: 'close', label: '关闭', variant: 'primary' })]
  }

  const actions: StructuredSubjectPeekAction[] = []
  if (peek.kind === 'resource') actions.push({ kind: 'resource-sidecar' })
  if (peek.kind === 'external') actions.push(structuredSubjectPeekButtonAction({ kind: 'copy-external', label: '复制 URL', variant: 'ghost' }))
  actions.push(structuredSubjectPeekButtonAction({ kind: 'cancel', label: '取消', variant: 'ghost' }))
  if (peek.source) actions.push(structuredSubjectPeekButtonAction({ kind: 'open-source', label: '打开来源', variant: 'ghost' }))
  actions.push(structuredSubjectPeekButtonAction({
    kind: 'primary-open',
    label: peek.kind === 'term' ? '打开承载文件' : peek.kind === 'external' ? '打开 URL' : '打开资源',
    variant: 'primary',
  }))
  return actions
}
