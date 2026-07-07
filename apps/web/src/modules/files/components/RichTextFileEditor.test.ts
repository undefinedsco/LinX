import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  extractRichTextEditorDocumentSummary,
  serializeTiptapJsonToMarkdown,
  shouldOpenSlashBlockMenu,
  type RichTextEditorContent,
} from '../ui/RichTextFileEditor'
import { RichTextFileEditor } from '../ui/RichTextFileEditor'

function markdownContent(text = '# Note\n\nBody'): RichTextEditorContent {
  return {
    inputFormat: 'markdownish',
    saveFormat: 'markdown',
    text,
  }
}

const markdownNoteContent = markdownContent('# Note\n\nBody')

const plainTextContent: RichTextEditorContent = {
  inputFormat: 'markdownish',
  saveFormat: 'markdown',
  text: 'Open [source](https://source.example/report.pdf) for context.',
}

function revealRichTextToolbar(editor: Element | null) {
  expect(editor).toBeTruthy()
  fireEvent.focus(editor as Element)
}

describe('RichTextFileEditor serialization', () => {
  it('extracts generic document summary from headings and links', () => {
    expect(extractRichTextEditorDocumentSummary({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Quarterly report' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Read ' },
            {
              type: 'text',
              text: 'source',
              marks: [{ type: 'link', attrs: { href: 'https://source.example/report.pdf' } }],
            },
            {
              type: 'text',
              text: ' and duplicate',
              marks: [{ type: 'link', attrs: { href: 'https://source.example/report.pdf' } }],
            },
          ],
        },
      ],
    })).toEqual({
      title: 'Quarterly report',
      links: ['https://source.example/report.pdf'],
    })
  })

  it('serializes common Tiptap blocks back to markdown', () => {
    expect(serializeTiptapJsonToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Project note' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Keep ' },
            { type: 'text', text: 'format', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' when saving.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }],
        },
      ],
    })).toBe('# Project note\n\nKeep **format** when saving.\n\n- first\n- second\n\n> quoted')
  })

  it('preserves ordered lists when saving markdown', () => {
    expect(serializeTiptapJsonToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
          ],
        },
      ],
    })).toBe('1. first\n2. second')
  })

  it('serializes link marks as markdown links', () => {
    expect(serializeTiptapJsonToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Open ' },
            {
              type: 'text',
              text: 'source',
              marks: [{ type: 'link', attrs: { href: 'https://source.example/report.pdf' } }],
            },
            { type: 'text', text: ' for context.' },
          ],
        },
      ],
    })).toBe('Open [source](https://source.example/report.pdf) for context.')
  })

  it('adds a link to selected note text from the rich text toolbar before saving markdown', async () => {
    const onSaveText = vi.fn()
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent('Open source for context.'),
      editable: true,
      onSaveText,
    }))
    const editor = container.querySelector('.ProseMirror')
    revealRichTextToolbar(editor)

    const textNode = screen.getByText('Open source for context.').firstChild
    expect(textNode).toBeTruthy()
    const range = document.createRange()
    range.setStart(textNode as ChildNode, 'Open '.length)
    range.setEnd(textNode as ChildNode, 'Open source'.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.mouseUp(editor as Element)
    fireEvent.click(screen.getByRole('button', { name: '添加链接' }))
    fireEvent.change(screen.getByLabelText('链接地址'), { target: { value: 'https://source.example/report.pdf' } })
    fireEvent.click(screen.getByRole('button', { name: '应用链接' }))
    fireEvent.blur(editor as Element)

    await waitFor(() => expect(onSaveText).toHaveBeenCalledTimes(1))
    expect(onSaveText).toHaveBeenCalledWith('Open [source](https://source.example/report.pdf) for context.')
  })

  it('preserves markdown-ish links when saving non-markdown editable text files', async () => {
    const onSaveText = vi.fn()
    const { container } = render(createElement(RichTextFileEditor, {
      content: { ...plainTextContent, text: 'Open [source](https://source.example/report.pdf) for context.' },
      editable: true,
      onSaveText,
    }))
    const editor = container.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()
    expect(screen.getByRole('link', { name: 'source' })).toHaveAttribute('href', 'https://source.example/report.pdf')

    fireEvent.keyDown(editor as Element, { key: '/' })
    fireEvent.click(screen.getByRole('menuitem', { name: '待办' }))
    fireEvent.blur(editor as Element)

    await waitFor(() => expect(onSaveText).toHaveBeenCalledTimes(1))
    expect(onSaveText).toHaveBeenCalledWith(expect.stringContaining('Open [source](https://source.example/report.pdf) for context.'))
    expect(onSaveText).toHaveBeenCalledWith(expect.stringContaining('- [ ] Task'))
  })

  it('serializes code blocks as fenced markdown', () => {
    expect(serializeTiptapJsonToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'const ok = true' }],
        },
      ],
    })).toBe('```\nconst ok = true\n```')
  })

  it('initializes markdown notes with rich block semantics instead of plain text', () => {
    render(createElement(RichTextFileEditor, {
      content: markdownContent([
        '# Project note',
        '',
        'Open [source](https://source.example/report.pdf) and keep **important** context.',
        '',
        '> quoted context',
        '',
        '```',
        'const ok = true',
        '```',
        '',
        '1. first',
        '2. second',
      ].join('\n')),
      editable: true,
    }))

    expect(screen.getByRole('heading', { name: 'Project note' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'source' })).toHaveAttribute('href', 'https://source.example/report.pdf')
    expect(screen.getByText('important').tagName.toLowerCase()).toBe('strong')
    expect(screen.getByText('quoted context').closest('blockquote')).toBeTruthy()
    expect(screen.getByText('const ok = true').closest('pre')).toBeTruthy()
    expect(screen.getByText('first').closest('ol')).toBeTruthy()
    expect(screen.getByText('second').closest('ol')).toBeTruthy()
  })

  it('opens slash block commands only at the beginning of a block', () => {
    const createView = (textBeforeCursor: string) => ({
      state: {
        selection: {
          $from: {
            parent: {
              textBetween: vi.fn(() => textBeforeCursor),
            },
            parentOffset: textBeforeCursor.length,
          },
        },
      },
    })

    expect(shouldOpenSlashBlockMenu(createView(''))).toBe(true)
    expect(shouldOpenSlashBlockMenu(createView('   '))).toBe(true)
    expect(shouldOpenSlashBlockMenu(createView('https:'))).toBe(false)
  })

  it('renders compact block controls for editable note sheets', () => {
    render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
    }))
    revealRichTextToolbar(document.querySelector('.ProseMirror'))

    expect(screen.getByRole('toolbar', { name: '块操作' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '插入段落块' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移动当前块' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '代码块' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '插入段落块' }))
    fireEvent.click(screen.getByRole('button', { name: '代码块' }))
  })

  it('renders editable notes as a borderless sheet with contextual byline controls', () => {
    render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
    }))

    const sheet = screen.getByTestId('rich-text-file-editor')
    expect(sheet).toHaveAttribute('data-editor-surface', 'sheet')
    expect(sheet.className).not.toContain('border ')
    expect(sheet.className).not.toContain('shadow')

    expect(screen.queryByRole('toolbar', { name: '富文本块工具' })).not.toBeInTheDocument()

    const editor = document.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()
    fireEvent.focus(editor as Element)

    const formattingToolbar = screen.getByRole('toolbar', { name: '富文本块工具' })
    expect(formattingToolbar).toHaveAttribute('data-toolbar-density', 'compact')
    expect(formattingToolbar).toHaveAttribute('data-control-placement', 'byline')
    expect(formattingToolbar).toHaveAttribute('data-control-surface', 'byline-contextual')
    expect(formattingToolbar.className).toContain('absolute')
    expect(formattingToolbar.className).not.toContain('opacity-70')

    const blockControls = screen.getByRole('toolbar', { name: '块操作' })
    expect(blockControls).toHaveAttribute('data-control-placement', 'byline')
    expect(blockControls.className).toContain('group-hover')
  })

  it('places secondary formatting controls in the sheet flow before the editable body', () => {
    render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
    }))

    const editor = document.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()
    fireEvent.focus(editor as Element)
    const formattingToolbar = screen.getByRole('toolbar', { name: '富文本块工具' })

    expect(formattingToolbar.compareDocumentPosition(editor as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('moves the current block from the byline block handle and saves markdown order', async () => {
    const onSaveText = vi.fn()
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
      onSaveText,
    }))
    const editor = container.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '移动当前块' }))
    expect(screen.getByRole('menu', { name: '块移动' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '下移块' }))
    fireEvent.blur(editor as Element)

    await waitFor(() => expect(onSaveText).toHaveBeenCalledTimes(1))
    expect(onSaveText).toHaveBeenCalledWith('Body\n\n# Note')
  })

  it('shows dirty, saving, and saved state around inline rich text saves', async () => {
    let finishSave: (() => void) | null = null
    const onSaveText = vi.fn(() => new Promise<void>((resolve) => {
      finishSave = resolve
    }))
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(''),
      editable: true,
      onSaveText,
    }))

    const editor = container.querySelector('.ProseMirror')
    revealRichTextToolbar(editor)
    expect(screen.getByText('已保存')).toBeInTheDocument()
    fireEvent.paste(editor as Element, {
      clipboardData: {
        getData: (type: string) => type === 'text/plain' ? 'New saved line' : '<p>New saved line</p>',
      },
    })

    await waitFor(() => expect(screen.getByText('未保存')).toBeInTheDocument())

    fireEvent.blur(editor as Element)
    revealRichTextToolbar(editor)

    await waitFor(() => expect(screen.getByText('正在保存')).toBeInTheDocument())

    finishSave?.()

    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    expect(onSaveText).toHaveBeenCalledTimes(1)
  })

  it('sanitizes dangerous pasted html before saving markdown', async () => {
    const onSaveText = vi.fn()
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(''),
      editable: true,
      onSaveText,
    }))
    const editor = container.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()

    fireEvent.paste(editor as Element, {
      clipboardData: {
        getData: (type: string) => {
          if (type === 'text/html') {
            return [
              '<p>Keep this',
              '<img src="x" onerror="alert(1)">',
              '<script>alert("owned")</script>',
              '<a href="javascript:alert(2)">unsafe link</a>',
              '<a href="https://safe.example/doc">safe link</a>',
              '</p>',
            ].join('')
          }
          if (type === 'text/plain') return 'Keep this unsafe link safe link'
          return ''
        },
      },
    })
    fireEvent.blur(editor as Element)

    await waitFor(() => expect(onSaveText).toHaveBeenCalledTimes(1))
    const savedText = onSaveText.mock.calls[0][0] as string
    expect(savedText).toContain('Keep this unsafe link safe link')
    expect(savedText).not.toContain('<script')
    expect(savedText).not.toContain('onerror')
    expect(savedText).not.toContain('javascript:')
    expect(savedText).not.toContain('alert')
  })

  it('does not save when undo restores the original markdown', async () => {
    const onSaveText = vi.fn()
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(''),
      editable: true,
      onSaveText,
    }))
    const editor = container.querySelector('.ProseMirror')
    revealRichTextToolbar(editor)

    fireEvent.keyDown(editor as Element, { key: '/' })
    fireEvent.click(screen.getByRole('menuitem', { name: '待办' }))
    await waitFor(() => expect(screen.getByText('未保存')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    fireEvent.blur(editor as Element)
    revealRichTextToolbar(editor)

    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    expect(onSaveText).not.toHaveBeenCalled()
  })

  it('marks the editor saved immediately when undo restores the original markdown', async () => {
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
      onSaveText: vi.fn(),
    }))
    const editor = container.querySelector('.ProseMirror')
    revealRichTextToolbar(editor)

    fireEvent.keyDown(editor as Element, { key: '/' })
    fireEvent.click(screen.getByRole('menuitem', { name: '待办' }))
    await waitFor(() => expect(screen.getByText('未保存')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '撤销' }))

    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '重做' }))

    await waitFor(() => expect(screen.getByText('未保存')).toBeInTheDocument())
  })

  it('saves the redone markdown after undo temporarily restores the original text', async () => {
    const onSaveText = vi.fn()
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(''),
      editable: true,
      onSaveText,
    }))
    const editor = container.querySelector('.ProseMirror')
    revealRichTextToolbar(editor)

    fireEvent.keyDown(editor as Element, { key: '/' })
    fireEvent.click(screen.getByRole('menuitem', { name: '待办' }))
    await waitFor(() => expect(screen.getByText('未保存')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    fireEvent.blur(editor as Element)

    await waitFor(() => expect(onSaveText).toHaveBeenCalledTimes(1))
    expect(onSaveText).toHaveBeenCalledWith(expect.stringContaining('- [ ] Task'))
  })

  it('exposes undo and redo availability through disabled toolbar buttons', async () => {
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(''),
      editable: true,
    }))
    const editor = container.querySelector('.ProseMirror')
    revealRichTextToolbar(editor)
    const undoButton = screen.getByRole('button', { name: '撤销' })
    const redoButton = screen.getByRole('button', { name: '重做' })

    expect(undoButton).toBeDisabled()
    expect(redoButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '插入段落块' }))

    await waitFor(() => expect(undoButton).toBeEnabled())
    expect(redoButton).toBeDisabled()

    fireEvent.click(undoButton)

    await waitFor(() => expect(redoButton).toBeEnabled())
  })

  it('opens a slash block menu and inserts a markdown checklist item', async () => {
    const onSaveText = vi.fn()
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(''),
      editable: true,
      onSaveText,
    }))
    const editor = container.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()

    fireEvent.keyDown(editor as Element, { key: '/' })

    expect(screen.getByRole('menu', { name: '块命令' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '段落' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '一级标题' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '项目列表' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '待办' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '代码块' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '待办' }))
    expect(screen.queryByRole('menu', { name: '块命令' })).not.toBeInTheDocument()

    fireEvent.blur(editor as Element)

    await waitFor(() => expect(onSaveText).toHaveBeenCalledWith(expect.stringContaining('- [ ] Task')))
    expect(onSaveText).toHaveBeenCalledWith(expect.not.stringContaining('/'))
  })

  it('supports keyboard selection in the slash block menu', async () => {
    const onSaveText = vi.fn()
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
      onSaveText,
    }))
    const editor = container.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()

    fireEvent.keyDown(editor as Element, { key: '/' })
    const menu = screen.getByRole('menu', { name: '块命令' })
    expect(menu).toHaveAttribute('aria-activedescendant', 'rich-text-block-command-paragraph')

    fireEvent.keyDown(editor as Element, { key: 'ArrowDown' })
    fireEvent.keyDown(editor as Element, { key: 'ArrowDown' })
    fireEvent.keyDown(editor as Element, { key: 'ArrowDown' })

    expect(menu).toHaveAttribute('aria-activedescendant', 'rich-text-block-command-todo')

    fireEvent.keyDown(editor as Element, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('menu', { name: '块命令' })).not.toBeInTheDocument())

    fireEvent.blur(editor as Element)

    await waitFor(() => expect(onSaveText).toHaveBeenCalledWith(expect.stringContaining('- [ ] Task')))
  })

  it('closes the slash block menu with escape', () => {
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
    }))
    const editor = container.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()

    fireEvent.keyDown(editor as Element, { key: '/' })
    expect(screen.getByRole('menu', { name: '块命令' })).toBeInTheDocument()

    fireEvent.keyDown(editor as Element, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '块命令' })).not.toBeInTheDocument()
  })

  it('does not open slash commands for modifier shortcuts', () => {
    const { container } = render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
    }))
    const editor = container.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()

    fireEvent.keyDown(editor as Element, { key: '/', ctrlKey: true })
    fireEvent.keyDown(editor as Element, { key: '/', metaKey: true })
    fireEvent.keyDown(editor as Element, { key: '/', altKey: true })

    expect(screen.queryByRole('menu', { name: '块命令' })).not.toBeInTheDocument()
  })

  it('renders source-linked content after feature-owned marker cleanup', () => {
    render(createElement(RichTextFileEditor, {
      content: markdownContent('# Imported note\n\nSource paragraph'),
      editable: true,
    }))

    expect(screen.getByRole('heading', { name: 'Imported note' })).toBeInTheDocument()
    expect(screen.getByText('Source paragraph')).toBeInTheDocument()
  })

  it('surfaces generic warnings projected by the editor feature owner', () => {
    render(createElement(RichTextFileEditor, {
      content: markdownContent('# Edited note\n\n# Imported note'),
      editable: true,
      warning: {
        title: '内容需要确认',
        description: '请确认外部更新后再替换本地编辑。',
      },
    }))

    expect(screen.getByText('内容需要确认')).toBeInTheDocument()
    expect(screen.getByText('请确认外部更新后再替换本地编辑。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edited note' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Imported note' })).toBeInTheDocument()
  })

  it('uses generic copy for the default review action', () => {
    render(createElement(RichTextFileEditor, {
      content: markdownContent(),
      editable: true,
      onSubmitProposal: vi.fn(),
    }))
    revealRichTextToolbar(document.querySelector('.ProseMirror'))

    expect(screen.getByRole('button', { name: '提交 审批' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '提交 AI 修改审批' })).not.toBeInTheDocument()
  })

  it('keeps block controls out of readonly previews', () => {
    render(createElement(RichTextFileEditor, {
      content: markdownContent(),
    }))

    expect(screen.queryByRole('toolbar', { name: '块操作' })).not.toBeInTheDocument()
    const editor = document.querySelector('.ProseMirror')
    expect(editor).toBeTruthy()
    fireEvent.keyDown(editor as Element, { key: '/' })
    expect(screen.queryByRole('menu', { name: '块命令' })).not.toBeInTheDocument()
  })
})
