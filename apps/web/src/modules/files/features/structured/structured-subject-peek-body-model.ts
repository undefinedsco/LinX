import {
  isStructuredCellRelationLikeValue,
  normalizeStructuredCellResourceValue,
} from '../../domain/structured/structured-cell-editor-plan'
import {
  displayStructuredFactValue,
  type StructuredSubjectPeek,
} from '../../domain/structured/structured-subject-peek'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'

type StructuredSubjectPeekValue = NonNullable<StructuredSubjectPeek>

function projectStructuredSubjectPeekBodyChrome() {
  return {
    backlinkSection: {
      heading: '反向链接',
    },
    predicateSection: {
      heading: '属性',
    },
    sourceLinkedSection: {
      ariaLabel: '来源与同步信息',
      heading: '来源与同步',
    },
    sourceSection: {
      heading: '来源',
    },
    summary: {
      ariaLabel: 'Subject card summary',
      typePrefix: '类型',
    },
    technicalDetails: {
      ariaLabel: '查看 URI 详情',
      label: '更多信息',
      subjectUriLabel: 'Subject URI',
    },
    termDefinitionSection: {
      heading: 'term 定义',
    },
  }
}

export function projectStructuredSubjectPeekTechnicalDetailsToggle(technicalDetailsOpen: boolean) {
  return {
    expanded: technicalDetailsOpen,
    stateLabel: technicalDetailsOpen ? '收起' : 'URI',
  }
}

export function projectStructuredSubjectPeekBodyModel(peek: StructuredSubjectPeekValue) {
  const backlinkRows = peek.backlinks.map((backlink) => ({
    key: `${backlink.subject}-${backlink.predicate}`,
    label: localPredicateLabel(backlink.predicate),
    predicate: backlink.predicate,
    subject: backlink.subject,
  }))
  const predicateRows = peek.predicates.map((fact) => ({
    key: fact.predicate,
    label: localPredicateLabel(fact.predicate),
    predicate: fact.predicate,
    title: fact.values.join(', '),
    values: displayPeekFactValues(fact.values),
  }))
  const sourceRows = sourceRowsForPeek(peek)
  const termFactRows = peek.facts.map((fact) => ({
    key: fact.predicate,
    predicate: fact.predicate,
    title: fact.values.join(', '),
    values: fact.values.join(', '),
  }))

  return {
    backlinkRows,
    chrome: projectStructuredSubjectPeekBodyChrome(),
    locationLabel: locationLabelForPeek(peek),
    predicateRows,
    showBacklinkSection: backlinkRows.length > 0,
    showPredicateSection: predicateRows.length > 0,
    showSourceLinkedCardSection: sourceRows.length > 0,
    showSourceSection: Boolean(peek.source && !peek.sourceLinkedCard),
    showTermDefinitionSection: peek.kind === 'term' && termFactRows.length > 0,
    sourceRows,
    sourceValue: peek.source ?? '',
    termFactRows,
    typeLabel: peek.className ? localPredicateLabel(normalizeStructuredCellResourceValue(peek.className)) : '',
  }
}

function displayPeekFactValues(values: string[]) {
  return values.map((value) => (
    isStructuredCellRelationLikeValue(value)
      ? normalizeStructuredCellResourceValue(value)
      : displayStructuredFactValue(value)
  )).join(', ')
}

function locationLabelForPeek(peek: StructuredSubjectPeekValue) {
  if (peek.kind === 'term') return '词表文件'
  if (peek.kind === 'external') return '外部链接'
  return '资源'
}

function sourceRowsForPeek(peek: StructuredSubjectPeekValue): [string, string][] {
  if (!peek.sourceLinkedCard) return []
  return [
    peek.source ? ['来源', peek.source] : null,
    peek.sourceLinkedCard.bodyResourceUri ? ['正文', peek.sourceLinkedCard.bodyResourceUri] : null,
    peek.sourceLinkedCard.ingestVersion ? ['同步', peek.sourceLinkedCard.ingestVersion] : null,
    peek.sourceLinkedCard.ingestManifestUri ? ['同步记录', peek.sourceLinkedCard.ingestManifestUri] : null,
  ].filter((row): row is [string, string] => !!row)
}
