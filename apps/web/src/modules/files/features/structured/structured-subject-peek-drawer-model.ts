import type { StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'

export type StructuredSubjectPeekDrawerChrome = {
  closeAriaLabel: string
  drawerAriaLabel: string
  iconKind: 'external-link' | 'info'
  title: string
}

export function projectStructuredSubjectPeekDrawerChrome(
  peek: NonNullable<StructuredSubjectPeek>,
): StructuredSubjectPeekDrawerChrome {
  const isTerm = peek.kind === 'term'
  const isExternal = peek.kind === 'external'
  return {
    closeAriaLabel: isTerm ? 'Close term peek' : 'Close subject peek',
    drawerAriaLabel: isTerm ? 'Structured term peek' : 'Structured subject peek',
    iconKind: isExternal ? 'external-link' : 'info',
    title: isTerm ? '定义预览' : isExternal ? '链接预览' : '卡片预览',
  }
}
