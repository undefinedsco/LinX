/**
 * 新建表格 (R6 K6b): a table is a Turtle data document in the current folder.
 *
 * - the file is `<name>.ttl`; its rows are subjects typed with a class named after
 *   the table (the class is proposed to 词表 › 类型 through the normal approval
 *   flow, so it stays 未确认 until confirmed);
 * - every table has the 名称 column (`schema:name`); the other first columns are
 *   proposed to 词表 › 属性 the same way and show as 未确认 columns;
 * - the file starts with one row so the table opens with something to edit.
 */
import {
  autoPredicateLocalName,
  createPredicateDefinitionDraft,
  type PredicateDefinitionDraft,
} from './structured-predicate-draft'
import { resolveLocalVocabTermUri } from './structured-table-vocab'

export const NEW_TABLE_NAME_PREDICATE = 'http://schema.org/name'

export interface NewTableColumnInput {
  label: string
  /** One of PREDICATE_VALUE_TYPE_OPTIONS values. */
  type: string
  /** Choices for 选项 columns, comma separated. */
  enumOptions?: string
}

export type NewTablePlan =
  | { ok: false; message: string }
  | {
      ok: true
      fileName: string
      documentUri: string
      content: string
      classUri: string
      className: string
      columns: Array<{ draft: PredicateDefinitionDraft }>
    }

function ensureContainer(uri: string) {
  return uri.endsWith('/') ? uri : `${uri}/`
}

export function validateNewTableName(name: string, siblingNames: readonly string[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '先给表格起个名字'
  if (/[\\/#?%]/.test(trimmed)) return '名字里不能有 / \\ # ? %'
  const fileName = `${trimmed}.ttl`
  if (siblingNames.some((sibling) => sibling.toLowerCase() === fileName.toLowerCase())) return '这里已经有同名的文件'
  return null
}

export function planNewTable({
  containerUri,
  name,
  columns,
  siblingNames,
  currentPodRootUri,
}: {
  containerUri: string
  name: string
  columns: readonly NewTableColumnInput[]
  siblingNames: readonly string[]
  currentPodRootUri?: string | null
}): NewTablePlan {
  const message = validateNewTableName(name, siblingNames)
  if (message) return { ok: false, message }
  const trimmed = name.trim()
  const fileName = `${trimmed}.ttl`
  const documentUri = `${ensureContainer(containerUri)}${encodeURIComponent(fileName)}`
  const classLocalName = autoPredicateLocalName(trimmed)
  const className = classLocalName.charAt(0).toUpperCase() + classLocalName.slice(1)
  const classUri = resolveLocalVocabTermUri(documentUri, className, currentPodRootUri)
  const seen = new Set<string>(['名称'])
  const drafts: Array<{ draft: PredicateDefinitionDraft }> = []
  for (const column of columns) {
    const label = column.label.trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    drafts.push({
      draft: {
        ...createPredicateDefinitionDraft(classUri),
        label,
        localName: autoPredicateLocalName(label),
        type: column.type,
        enumOptions: column.enumOptions ?? '',
      },
    })
  }
  // A row's name is its own address (`#名字`), the same as rows typed into 新的一行.
  const content = [
    `<#${encodeURIComponent('第一行')}> a <${classUri}> .`,
    '',
  ].join('\n')
  return { ok: true, fileName, documentUri, content, classUri, className, columns: drafts }
}
