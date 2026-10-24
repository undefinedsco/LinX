import type {
  StructuredTableProjection,
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import type { AiColumnChange } from '../../domain/proposal/ai-column-change-model'
import { classifyStructuredColumnValueKind } from '../../domain/structured/structured-column-filter'
import { readablePredicateLabel } from '../../domain/structured/structured-table-vocab'

export type StructuredPredicateColumnProposal = {
  id: string
  label: string
  uri: string
  predicateUri?: string
  type: string
  description: string
  shape: string
  enumOptions: string[]
  /** `confirmed`: a column the person made; it is already in the vocabulary, only waiting to show up in the table. */
  status: 'pending' | 'approval-staged' | 'confirmed'
  vocabProposal?: VocabTermProposal
  /** A column LinX added (R6 K6b): shows its own header. */
  aiColumn?: AiColumnChange
}

export type StructuredPredicateHeaderColumnModel = {
  label: string
  actionLabel: string
  observedValues: string[]
}

type DefinedPredicateColumnHeaderModel = {
  kind: 'defined'
  description: string
  displayLabel: string
  label: string
  normalizedLabel: string
  observedValues: string[]
  predicate: string
  ruleText: string
  shapeRuleActions: { uri: string; label: string }[]
  statusLabel: string
  typeLabel: string
}

type PendingPredicateColumnHeaderModel = {
  kind: 'pending'
  description: string
  displayLabel: string
  label: string
  normalizedLabel: string
  aiColumn?: AiColumnChange
  openableVocabProposal?: VocabTermProposal
  predicateUri?: string
  proposalUri: string
  ruleText: string
  shape: string
  status: 'pending' | 'approval-staged'
  statusLabel: string
  submitInline: boolean
  type: string
  vocabProposal?: {
    proposalResourceUri: string
    targetVocabUri: string
  }
}

export type StructuredPendingPredicateHeaderChrome = {
  menu: {
    actions: {
      discard: { label: string }
      openProposal: { label: string } | null
      submit: { label: string } | null
    }
    approvalNotice: string | null
    rows: {
      approvalRecord: { label: string }
      description: { label: string }
      predicate: { label: string }
      rule: { label: string }
      status: { label: string }
      uri: { label: string }
    }
    title: string
  }
  trigger: {
    ariaLabel: string
  }
}

export type StructuredPredicateColumnHeaderModel =
  | DefinedPredicateColumnHeaderModel
  | PendingPredicateColumnHeaderModel

type StructuredPredicateHeaderValueKind = 'text' | 'boolean' | 'number' | 'date' | 'relation'

function inferStructuredPredicateKind(values: readonly string[]): StructuredPredicateHeaderValueKind {
  const value = values.find(Boolean)
  if (!value) return 'text'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === 'false') return 'boolean'
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return 'number'
  if (/^"\d{4}-\d{2}-\d{2}"(?:\^\^xsd:date)?$/.test(normalized)) return 'date'
  if (/^<[^>]+>$/.test(normalized) || /^https?:\/\//.test(normalized)) return 'relation'
  return 'text'
}

export function projectStructuredPredicateTypeLabel(
  definition: StructuredVocabPredicateDefinition | undefined,
  values: readonly string[],
) {
  return predicateDefinitionTypeLabel(definition, values)
}

function predicateDefinitionTypeLabel(
  definition: StructuredVocabPredicateDefinition | undefined,
  values: readonly string[],
) {
  return definition?.valueType || inferStructuredPredicateKind(values)
}

function predicateDefinitionRuleText(definition: StructuredVocabPredicateDefinition | undefined) {
  const shapeRules = definition?.shapeRules ?? []
  if (shapeRules.length > 0) {
    return shapeRules.map((rule) => rule.constraint || rule.label || rule.uri).filter(Boolean).join(' · ')
  }
  return definition?.shape || '使用默认规则'
}

function pendingFieldStatusLabel(status: 'pending' | 'approval-staged') {
  return status === 'approval-staged' ? '等你确认（收件箱里有记录）' : '待确认'
}

function normalizedPredicateHeaderLabel(label: string) {
  return label.replace(/\*$/, '')
}

function pendingPredicateHeaderLabel(label: string) {
  return normalizedPredicateHeaderLabel(label)
}

export function projectStructuredPendingPredicateHeaderChrome({
  hasVocabProposal,
  normalizedLabel,
}: {
  hasVocabProposal: boolean
  normalizedLabel: string
}): StructuredPendingPredicateHeaderChrome {
  return {
    menu: {
      actions: {
        discard: { label: '放弃此字段' },
        openProposal: hasVocabProposal ? { label: '打开审批记录' } : null,
        // The person decides for their own columns; keeping one writes it to the vocabulary at once.
        submit: { label: '保留这列' },
      },
      approvalNotice: hasVocabProposal ? '已提交审批记录；词表未变更。' : null,
      rows: {
        approvalRecord: { label: '审批记录' },
        description: { label: '说明' },
        predicate: { label: '字段' },
        rule: { label: '规则' },
        status: { label: '状态' },
        uri: { label: '专业标识' },
      },
      title: '待确认字段',
    },
    trigger: {
      ariaLabel: `待确认字段 ${normalizedLabel}`,
    },
  }
}

export function projectStructuredPredicateHeaderColumnModel(input: {
  predicate: string
  projection: Pick<StructuredTableProjection, 'rows'>
  proposal?: Pick<StructuredPredicateColumnProposal, 'label'> | null
  definition?: Pick<StructuredVocabPredicateDefinition, 'label'> | null
  showNamespaces: boolean
}): StructuredPredicateHeaderColumnModel {
  const label = input.proposal
    ? input.proposal.label
    : input.showNamespaces
      ? input.predicate
      : readablePredicateLabel(input.predicate, input.definition?.label)

  return {
    label,
    actionLabel: input.proposal && !label.endsWith('*') ? `${label}*` : label,
    observedValues: input.projection.rows.flatMap((row) => (
      row.cells.find((cell) => cell.predicate === input.predicate)?.values ?? []
    )),
  }
}

export function projectStructuredPredicateColumnHeader({
  definition,
  observedValues,
  predicate,
  proposal,
  showNamespaces = false,
}: {
  definition?: StructuredVocabPredicateDefinition
  observedValues: string[]
  predicate: string
  proposal?: StructuredPredicateColumnProposal
  showNamespaces?: boolean
}): StructuredPredicateColumnHeaderModel {
  if (proposal) {
    const displayLabel = pendingPredicateHeaderLabel(proposal.label)
    return {
      kind: 'pending',
      description: proposal.description,
      displayLabel,
      label: proposal.label,
      normalizedLabel: normalizedPredicateHeaderLabel(proposal.label),
      aiColumn: proposal.aiColumn,
      openableVocabProposal: proposal.vocabProposal,
      predicateUri: proposal.predicateUri,
      proposalUri: proposal.uri,
      ruleText: proposal.shape || '使用默认规则',
      shape: proposal.shape,
      status: proposal.status === 'confirmed' ? 'pending' : proposal.status,
      statusLabel: pendingFieldStatusLabel(proposal.status === 'confirmed' ? 'pending' : proposal.status),
      submitInline: true,
      type: proposal.type,
      vocabProposal: proposal.vocabProposal
        ? {
            proposalResourceUri: proposal.vocabProposal.proposalResourceUri,
            targetVocabUri: proposal.vocabProposal.targetVocabUri,
          }
      : undefined,
    }
  }

  const label = showNamespaces ? predicate : readablePredicateLabel(predicate, definition?.label)
  const shapeRules = definition?.shapeRules ?? []
  return {
    kind: 'defined',
    description: definition?.description || '用于编辑、校验、选项和链接行为。',
    displayLabel: label,
    label,
    normalizedLabel: normalizedPredicateHeaderLabel(label),
    observedValues,
    predicate,
    ruleText: predicateDefinitionRuleText(definition),
    shapeRuleActions: shapeRules
      .filter((rule) => rule.uri)
      .map((rule) => ({
        uri: rule.uri as string,
        label: rule.label || rule.constraint || rule.uri as string,
      })),
    statusLabel: definition?.status || '已识别',
    typeLabel: predicateDefinitionTypeLabel(definition, observedValues),
  }
}

export type StructuredPredicateTypeIconKind = 'text' | 'number' | 'date' | 'boolean' | 'relation' | 'choice'

/** The icon beside a column title (R6 K6): what kind of value the column holds. */
export function projectStructuredPredicateTypeIconKind(typeLabel: string | null | undefined): StructuredPredicateTypeIconKind {
  return classifyStructuredColumnValueKind(typeLabel)
}
