import type { StructuredVocabTermDefinition } from '../../domain/structured/structured-table'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'

export function projectStructuredResourcePreviewHeaderModel({
  classDefinition,
  pendingClassScopeProposal,
  selectedClassName,
}: {
  classDefinition?: StructuredVocabTermDefinition
  pendingClassScopeProposal?: { label: string; uri: string }
  selectedClassName?: string | null
}) {
  const classScopeDisplayLabel = selectedClassName
    ? classDefinition?.label || pendingClassScopeProposal?.label || localPredicateLabel(selectedClassName)
    : '选择或创建类型'

  return {
    classScopeButtonLabel: selectedClassName
      ? `当前类型：${classScopeDisplayLabel}`
      : '选择类型',
    classScopeDisplayLabel,
    classScopeLabel: selectedClassName ? classScopeDisplayLabel : '选择或创建类型',
  }
}
