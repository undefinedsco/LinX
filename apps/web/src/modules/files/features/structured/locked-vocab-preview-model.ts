import type { LockedVocabRegistryKind } from '../../domain/structured/structured-table'

const LOCKED_VOCAB_PREVIEW_CHROME_COPY: Record<LockedVocabRegistryKind, { title: string; countLabel: (count: number) => string }> = {
  terms: { title: '词表定义表', countLabel: (count) => `${count} 条定义` },
  shapes: { title: 'Shape 规则表', countLabel: (count) => `${count} 条规则` },
  namespaces: { title: '命名空间表', countLabel: (count) => `${count} 个命名空间` },
}

export function projectLockedVocabPreviewChrome({
  registryKind,
  registryRowCount,
}: {
  registryKind: LockedVocabRegistryKind
  registryRowCount: number
}) {
  const copy = LOCKED_VOCAB_PREVIEW_CHROME_COPY[registryKind]

  return {
    viewport: { ariaLabel: 'Locked vocab registry viewport' },
    header: {
      title: copy.title,
      countLabel: copy.countLabel(registryRowCount),
      readOnlyNote: '定义表只读；修改通过待确认提案进入审批。',
      badge: { label: '只读' },
    },
  }
}
