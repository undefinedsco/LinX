import { describe, expect, it } from 'vitest'

import {
  RICH_TEXT_COMMAND_CATALOG,
  projectRichTextCommandSearch,
} from './command-catalog'

describe('rich text command catalog', () => {
  it('keeps block insertion commands in a stable display order', () => {
    expect(RICH_TEXT_COMMAND_CATALOG.map((command) => command.id)).toEqual([
      'paragraph',
      'heading-1',
      'bullet-list',
      'ordered-list',
      'task',
      'table',
      'image',
      'reference',
      'quote',
      'code-block',
    ])
  })

  it('projects an empty search as grouped command menu rows', () => {
    expect(projectRichTextCommandSearch('').sections).toEqual([
      {
        id: 'text',
        label: '文本',
        commands: [
          expect.objectContaining({ id: 'paragraph', label: '段落' }),
          expect.objectContaining({ id: 'heading-1', label: '一级标题' }),
          expect.objectContaining({ id: 'quote', label: '引用块' }),
          expect.objectContaining({ id: 'code-block', label: '代码块' }),
        ],
      },
      {
        id: 'list',
        label: '列表',
        commands: [
          expect.objectContaining({ id: 'bullet-list', label: '项目列表' }),
          expect.objectContaining({ id: 'ordered-list', label: '编号列表' }),
          expect.objectContaining({ id: 'task', label: '待办' }),
        ],
      },
      {
        id: 'insert',
        label: '插入',
        commands: [
          expect.objectContaining({ id: 'table', label: '表格' }),
          expect.objectContaining({ id: 'image', label: '图片' }),
          expect.objectContaining({ id: 'reference', label: '引用资源' }),
        ],
      },
    ])
  })

  it('searches labels, aliases, and markdown hints without losing catalog order ties', () => {
    expect(projectRichTextCommandSearch('todo').sections).toEqual([
      {
        id: 'list',
        label: '列表',
        commands: [expect.objectContaining({ id: 'task', markdownHint: '- [ ] Task' })],
      },
    ])

    expect(projectRichTextCommandSearch('![]').sections).toEqual([
      {
        id: 'insert',
        label: '插入',
        commands: [expect.objectContaining({ id: 'image', markdownHint: '![Alt](url)' })],
      },
    ])

    expect(projectRichTextCommandSearch('list').sections[0]?.commands.map((command) => command.id)).toEqual([
      'bullet-list',
      'ordered-list',
      'task',
    ])
  })

  it('returns an explicit empty projection for unmatched searches', () => {
    expect(projectRichTextCommandSearch('zzzz')).toEqual({
      query: 'zzzz',
      activeCommandId: null,
      sections: [],
      emptyLabel: '没有匹配的块',
    })
  })
})
