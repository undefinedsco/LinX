export type RichTextCommandGroupId = 'text' | 'list' | 'insert'

export type RichTextCommandId =
  | 'paragraph'
  | 'heading-1'
  | 'bullet-list'
  | 'ordered-list'
  | 'task'
  | 'table'
  | 'image'
  | 'reference'
  | 'quote'
  | 'code-block'

export type RichTextCommandCatalogItem = {
  id: RichTextCommandId
  groupId: RichTextCommandGroupId
  label: string
  description: string
  markdownHint: string
  aliases: string[]
}

export type RichTextCommandSearchRow = Omit<RichTextCommandCatalogItem, 'groupId' | 'aliases'>

export type RichTextCommandSearchSection = {
  id: RichTextCommandGroupId
  label: string
  commands: RichTextCommandSearchRow[]
}

export type RichTextCommandSearchProjection = {
  query: string
  activeCommandId: RichTextCommandId | null
  sections: RichTextCommandSearchSection[]
  emptyLabel?: string
}

const GROUP_LABELS: Record<RichTextCommandGroupId, string> = {
  text: '文本',
  list: '列表',
  insert: '插入',
}

const GROUP_ORDER: RichTextCommandGroupId[] = ['text', 'list', 'insert']

export const RICH_TEXT_COMMAND_CATALOG: RichTextCommandCatalogItem[] = [
  {
    id: 'paragraph',
    groupId: 'text',
    label: '段落',
    description: '插入普通文本块',
    markdownHint: 'Text',
    aliases: ['body', 'plain', 'text'],
  },
  {
    id: 'heading-1',
    groupId: 'text',
    label: '一级标题',
    description: '插入一级章节标题',
    markdownHint: '# Heading',
    aliases: ['h1', 'title', 'heading'],
  },
  {
    id: 'bullet-list',
    groupId: 'list',
    label: '项目列表',
    description: '插入无序列表',
    markdownHint: '- Item',
    aliases: ['ul', 'list', 'unordered'],
  },
  {
    id: 'ordered-list',
    groupId: 'list',
    label: '编号列表',
    description: '插入有序列表',
    markdownHint: '1. Item',
    aliases: ['ol', 'list', 'ordered', 'numbered'],
  },
  {
    id: 'task',
    groupId: 'list',
    label: '待办',
    description: '插入可勾选任务',
    markdownHint: '- [ ] Task',
    aliases: ['todo', 'checkbox', 'checklist', 'list'],
  },
  {
    id: 'table',
    groupId: 'insert',
    label: '表格',
    description: '插入行列结构',
    markdownHint: '| Column |',
    aliases: ['grid', 'columns', 'rows'],
  },
  {
    id: 'image',
    groupId: 'insert',
    label: '图片',
    description: '通过 URL 插入图片',
    markdownHint: '![Alt](url)',
    aliases: ['picture', 'photo', 'media', '![]'],
  },
  {
    id: 'reference',
    groupId: 'insert',
    label: '引用资源',
    description: '关联来源或相关资源',
    markdownHint: '@[Label](url)',
    aliases: ['source', 'citation', 'resource', 'link'],
  },
  {
    id: 'quote',
    groupId: 'text',
    label: '引用块',
    description: '插入引用内容',
    markdownHint: '> Quote',
    aliases: ['blockquote', 'cite'],
  },
  {
    id: 'code-block',
    groupId: 'text',
    label: '代码块',
    description: '插入预格式化代码',
    markdownHint: '```',
    aliases: ['code', 'preformatted', 'snippet'],
  },
]

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function searchableText(command: RichTextCommandCatalogItem): string {
  return [
    command.id,
    command.label,
    command.description,
    command.markdownHint,
    ...command.aliases,
  ].join(' ').toLocaleLowerCase()
}

function toSearchRow(command: RichTextCommandCatalogItem): RichTextCommandSearchRow {
  return {
    id: command.id,
    label: command.label,
    description: command.description,
    markdownHint: command.markdownHint,
  }
}

export function projectRichTextCommandSearch(
  query: string,
  catalog: RichTextCommandCatalogItem[] = RICH_TEXT_COMMAND_CATALOG,
): RichTextCommandSearchProjection {
  const normalizedQuery = normalizeSearchText(query)
  const matches = normalizedQuery
    ? catalog.filter((command) => searchableText(command).includes(normalizedQuery))
    : catalog

  const sections = GROUP_ORDER
    .map((groupId) => {
      const commands = matches
        .filter((command) => command.groupId === groupId)
        .map(toSearchRow)
      return {
        id: groupId,
        label: GROUP_LABELS[groupId],
        commands,
      }
    })
    .filter((section) => section.commands.length > 0)

  const activeCommandId = sections[0]?.commands[0]?.id ?? null
  return {
    query: normalizedQuery,
    activeCommandId,
    sections,
    ...(sections.length === 0 ? { emptyLabel: '没有匹配的块' } : {}),
  }
}
