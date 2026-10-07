import type {
  StructuredTableProjection,
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'

export type StructuredPredicateColumnProposal = {
  id: string
  label: string
  uri: string
  predicateUri?: string
  type: string
  description: string
  shape: string
  enumOptions: string[]
  status: 'pending' | 'approval-staged'
  vocabProposal?: VocabTermProposal
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

export type StructuredDefinedPredicateHeaderChrome = {
  definitionTrigger: {
    ariaLabel: string
  }
  menu: {
    actions: {
      copyPredicate: { label: string }
      openPredicate: { label: string }
      shapeRuleActions: { uri: string; label: string }[]
    }
    actionsHeading: string
    rows: {
      description: { label: string }
      predicate: { label: string }
      rule: { label: string }
      status: { label: string }
    }
    title: string
  }
  sortButton: {
    ariaLabel: string
  }
}

type PendingPredicateColumnHeaderModel = {
  kind: 'pending'
  description: string
  displayLabel: string
  label: string
  normalizedLabel: string
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
  return definition?.shape || '使用默认 predicate 规则'
}

function pendingFieldStatusLabel(status: 'pending' | 'approval-staged') {
  return status === 'approval-staged' ? '等待 Inbox 审批' : '待提交'
}

function normalizedPredicateHeaderLabel(label: string) {
  return label.replace(/\*$/, '')
}

function pendingPredicateHeaderLabel(label: string) {
  return label.endsWith('*') ? label : `${label}*`
}

export function projectStructuredDefinedPredicateHeaderChrome({
  normalizedLabel,
  shapeRuleActions,
}: {
  normalizedLabel: string
  shapeRuleActions: readonly { uri: string; label: string }[]
}): StructuredDefinedPredicateHeaderChrome {
  return {
    definitionTrigger: {
      ariaLabel: `Open definition for ${normalizedLabel}`,
    },
    menu: {
      actions: {
        copyPredicate: { label: '复制 predicate URI' },
        openPredicate: { label: '打开 predicate URI' },
        shapeRuleActions: shapeRuleActions.map((rule) => ({
          uri: rule.uri,
          label: `打开规则 ${rule.label}`,
        })),
      },
      actionsHeading: '链接操作',
      rows: {
        description: { label: '说明' },
        predicate: { label: 'predicate' },
        rule: { label: '规则与形状' },
        status: { label: '状态' },
      },
      title: 'Predicate 定义',
    },
    sortButton: {
      ariaLabel: `Sort ${normalizedLabel}`,
    },
  }
}

export function projectStructuredPendingPredicateHeaderChrome({
  hasVocabProposal,
  normalizedLabel,
  status,
}: {
  hasVocabProposal: boolean
  normalizedLabel: string
  status: 'pending' | 'approval-staged'
}): StructuredPendingPredicateHeaderChrome {
  return {
    menu: {
      actions: {
        discard: { label: '放弃 predicate' },
        openProposal: hasVocabProposal ? { label: '打开审批记录' } : null,
        submit: status === 'pending' ? { label: '提交审核' } : null,
      },
      approvalNotice: hasVocabProposal ? '已提交审批记录；词表未变更。' : null,
      rows: {
        approvalRecord: { label: '审批记录' },
        description: { label: '说明' },
        predicate: { label: 'predicate' },
        rule: { label: '规则与形状' },
        status: { label: '状态' },
        uri: { label: 'URI' },
      },
      title: '待确认 predicate',
    },
    trigger: {
      ariaLabel: `待确认 predicate ${normalizedLabel}`,
    },
  }
}

export function projectStructuredPredicateHeaderColumnModel(input: {
  predicate: string
  projection: Pick<StructuredTableProjection, 'rows'>
  proposal?: Pick<StructuredPredicateColumnProposal, 'label'> | null
  showNamespaces: boolean
}): StructuredPredicateHeaderColumnModel {
  const label = input.proposal
    ? input.proposal.label
    : input.showNamespaces
      ? input.predicate
      : localPredicateLabel(input.predicate)

  return {
    label,
    actionLabel: input.proposal && !label.endsWith('*') ? `${label}*` : label,
    observedValues: input.projection.rows.flatMap((row) => (
      row.cells.find((cell) => cell.predicate === input.predicate)?.values ?? []
    )),
  }
}

export function projectStructuredPredicateColumnHeader({
  canCreateVocabTermProposal,
  definition,
  observedValues,
  predicate,
  proposal,
  showNamespaces = false,
}: {
  canCreateVocabTermProposal?: boolean
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
      openableVocabProposal: proposal.vocabProposal,
      predicateUri: proposal.predicateUri,
      proposalUri: proposal.uri,
      ruleText: proposal.shape || '使用默认 predicate 规则',
      shape: proposal.shape,
      status: proposal.status,
      statusLabel: pendingFieldStatusLabel(proposal.status),
      submitInline: !canCreateVocabTermProposal,
      type: proposal.type,
      vocabProposal: proposal.vocabProposal
        ? {
            proposalResourceUri: proposal.vocabProposal.proposalResourceUri,
            targetVocabUri: proposal.vocabProposal.targetVocabUri,
          }
      : undefined,
    }
  }

  const label = showNamespaces ? predicate : localPredicateLabel(predicate)
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
