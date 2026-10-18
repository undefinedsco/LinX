import { describe, expect, it } from 'vitest'

import { autoPredicateLocalName } from './structured-predicate-draft'
import { planNewTable, validateNewTableName } from './structured-new-table'

describe('new table plan', () => {
  it('builds a data document with one starter row and the extra columns as drafts', () => {
    const plan = planNewTable({
      containerUri: 'https://pod.example/活动/',
      name: '供应商',
      columns: [{ label: '联系人', type: 'contact' }, { label: '电话', type: 'text' }, { label: '电话', type: 'text' }, { label: '名称', type: 'text' }],
      siblingNames: [],
      currentPodRootUri: 'https://pod.example/',
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.documentUri).toBe(`https://pod.example/活动/${encodeURIComponent('供应商.ttl')}`)
    expect(plan.content).toContain('a <https://pod.example/.vocab/terms.ttl#')
    expect(plan.content).toContain(`<#${encodeURIComponent('第一行')}>`)
    expect(plan.content).not.toContain('schema.org/name')
    expect(plan.columns.map((column) => column.draft.label)).toEqual(['联系人', '电话'])
    expect(plan.columns[0]?.draft.localName).toMatch(/^p-[0-9a-f]{8}$/)
  })

  it('rejects empty, duplicate and unsafe names', () => {
    expect(validateNewTableName('  ', [])).toMatch(/名字/)
    expect(validateNewTableName('a/b', [])).toMatch(/不能有/)
    expect(validateNewTableName('活动', ['活动.TTL'])).toMatch(/同名/)
    expect(validateNewTableName('活动', [])).toBeNull()
  })

  it('names ASCII columns in camel case and others by hash', () => {
    expect(autoPredicateLocalName('Review status')).toBe('reviewStatus')
    expect(autoPredicateLocalName('擅长')).toBe(autoPredicateLocalName('擅长'))
    expect(autoPredicateLocalName('擅长')).not.toBe(autoPredicateLocalName('报名渠道'))
    expect(autoPredicateLocalName(' ')).toBe('')
  })
})
