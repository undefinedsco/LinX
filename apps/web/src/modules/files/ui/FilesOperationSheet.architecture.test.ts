import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const uiSheetPath = 'src/modules/files/ui/FilesOperationSheet.tsx'
const uiCompactTableShellPath = 'src/modules/files/ui/CompactTableShell.tsx'
const compactTableShellShimPath = 'src/modules/files/components/CompactTableShell.tsx'
const uiDetailPreviewPrimitivesPath = 'src/modules/files/ui/FileDetailPreviewPrimitives.tsx'
const uiEmptyStatePath = 'src/modules/files/ui/FilesEmptyState.tsx'
const uiRowPath = 'src/modules/files/ui/FilesListRow.tsx'
const uiColumnHeaderPath = 'src/modules/files/ui/FilesListColumnHeader.tsx'
const uiRichTextEditorPath = 'src/modules/files/ui/RichTextFileEditor.tsx'
const uiRichTextEditorModelPath = 'src/modules/files/ui/rich-text-file-editor-model.ts'
const richTextEditorShimPath = 'src/modules/files/components/RichTextFileEditor.tsx'
const uiRootPath = 'src/modules/files/ui'
const listPanePath = 'src/modules/files/features/list/FilesListPane.tsx'
const editorSheetPath = 'src/modules/files/features/editor/FileEditorSheet.tsx'
const sourceLinkedCardPreviewPath = 'src/modules/files/features/detail/FileDetailSourceLinkedCardPreview.tsx'
const structuredProjectionTablePath = 'src/modules/files/features/structured/StructuredProjectionTable.tsx'
const forbiddenUiDependencyPatterns = [
  /from\s+['"][^'"]*(?:\.\.\/)+queries(?:['"]|\/)/,
  /from\s+['"][^'"]*(?:\.\.\/)+collections(?:['"]|\/)/,
  /from\s+['"][^'"]*(?:\.\.\/)+domain(?:['"]|\/)/,
  /from\s+['"][^'"]*(?:\.\.\/)+store(?:['"]|\/)/,
  /from\s+['"][^'"]*(?:\.\.\/)+browser(?:['"]|\/)/,
  /from\s+['"]@\/modules\/files\/(?:queries|collections|store|browser)(?:['"]|\/)/,
  /from\s+['"]@tanstack\/react-query['"]/,
  /from\s+['"]@tanstack\/react-db['"]/,
  /from\s+['"]@\/providers\/solid-database-provider['"]/,
  /from\s+['"]@\/lib\/data\/current-pod-base['"]/,
]

function listSourceFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return []

  return readdirSync(rootPath).flatMap((entryName) => {
    const entryPath = `${rootPath}/${entryName}`
    if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath)
    if (!/\.(ts|tsx)$/.test(entryName) || /\.test\.(ts|tsx)$/.test(entryName)) return []
    return [entryPath]
  })
}

describe('Files UI boundary', () => {
  it('keeps list operation sheet as data-free Files UI', () => {
    expect(existsSync(uiSheetPath)).toBe(true)
    if (!existsSync(uiSheetPath)) return

    const uiSource = readFileSync(uiSheetPath, 'utf8')
    const listPaneSource = readFileSync(listPanePath, 'utf8')

    expect(uiSource).toMatch(/\nexport function FilesOperationSheet\(/)
    expect(uiSource).not.toContain('FilesEntry')
    expect(uiSource).toContain('confirmDisabled')
    expect(uiSource).not.toContain('pending')
    expect(uiSource).not.toContain('处理中')
    expect(uiSource).not.toContain('trim().length')
    for (const pattern of forbiddenUiDependencyPatterns) {
      expect(uiSource).not.toMatch(pattern)
    }

    expect(listPaneSource).toContain("from '../../ui/FilesOperationSheet'")
    expect(listPaneSource).toContain('confirmLabel={listOperation.operationConfirmChrome.label}')
    expect(listPaneSource).not.toContain("confirmLabel={listOperation.operationSheetModel?.confirmLabel ?? ''}")
    expect(listPaneSource).not.toContain('pending={listOperation.operationPending}')
    expect(listPaneSource).not.toMatch(/\nfunction FilesListOperationSheet\(/)
  })

  it('keeps compact table shell as data-free Files UI', () => {
    expect(existsSync(uiCompactTableShellPath)).toBe(true)
    expect(existsSync(compactTableShellShimPath)).toBe(true)
    if (!existsSync(uiCompactTableShellPath) || !existsSync(compactTableShellShimPath)) return

    const uiSource = readFileSync(uiCompactTableShellPath, 'utf8')
    const shimSource = readFileSync(compactTableShellShimPath, 'utf8')
    const structuredProjectionTableSource = readFileSync(structuredProjectionTablePath, 'utf8')

    expect(uiSource).toMatch(/\nexport function CompactTableShell(?:<[^>]+>)?\(/)
    expect(uiSource).toContain('@tanstack/react-table')
    expect(uiSource).not.toContain('StructuredResource')
    expect(uiSource).not.toContain('FilesEntry')
    expect(uiSource).not.toContain('subjectColumnId')
    expect(uiSource).not.toContain('addColumnId')
    expect(uiSource).not.toContain('readonlyColumnIds')
    expect(uiSource).not.toContain("'subject'")
    expect(uiSource).not.toContain("'__addPredicate'")
    expect(shimSource).toMatch(/^export \* from '..\/ui\/CompactTableShell'\n?$/)
    expect(structuredProjectionTableSource).toContain("from '../../ui/CompactTableShell'")
    expect(structuredProjectionTableSource).not.toContain("from '../../components/CompactTableShell'")
  })

  it('keeps list empty state as data-free Files UI', () => {
    expect(existsSync(uiEmptyStatePath)).toBe(true)
    if (!existsSync(uiEmptyStatePath)) return

    const uiSource = readFileSync(uiEmptyStatePath, 'utf8')
    const listPaneSource = readFileSync(listPanePath, 'utf8')

    expect(uiSource).toMatch(/\nexport function FilesEmptyState\(/)
    expect(uiSource).not.toContain('FilesEntry')
    expect(listPaneSource).toContain("from '../../ui/FilesEmptyState'")
    expect(listPaneSource).not.toMatch(/\nfunction EmptyState\(/)
  })

  it('keeps list row as data-free Files UI', () => {
    expect(existsSync(uiRowPath)).toBe(true)
    if (!existsSync(uiRowPath)) return

    const uiSource = readFileSync(uiRowPath, 'utf8')
    const listPaneSource = readFileSync(listPanePath, 'utf8')

    expect(uiSource).toMatch(/\nexport function FilesListRow\(/)
    expect(uiSource).not.toContain('FilesEntry')
    expect(uiSource).not.toContain('getFilesEntrySemanticLabel')
    expect(uiSource).not.toContain("'container'")
    expect(uiSource).not.toContain("'resource'")
    expect(uiSource).not.toContain("kind === 'container'")
    expect(listPaneSource).toContain("from '../../ui/FilesListRow'")
    expect(listPaneSource).not.toMatch(/\nfunction FileRow\(/)
  })

  it('keeps list column header as data-free Files UI', () => {
    expect(existsSync(uiColumnHeaderPath)).toBe(true)
    if (!existsSync(uiColumnHeaderPath)) return

    const uiSource = readFileSync(uiColumnHeaderPath, 'utf8')
    const listPaneSource = readFileSync(listPanePath, 'utf8')

    expect(uiSource).toMatch(/\nexport function FilesListColumnHeader(?:<[^>]+>)?\(/)
    expect(uiSource).not.toContain('useFilesStore')
    expect(uiSource).not.toContain('FileSortField')
    expect(uiSource).not.toContain('FilesListColumnSortField')
    expect(uiSource).not.toContain("'mimeType'")
    expect(uiSource).not.toContain("'modifiedAt'")
    expect(uiSource).not.toMatch(/onSort\('[^']+'\)/)
    expect(uiSource).not.toMatch(/field="[^"]+"/)
    expect(listPaneSource).toContain("from '../../ui/FilesListColumnHeader'")
    expect(listPaneSource).not.toMatch(/\nfunction ColumnHeader\(/)
  })

  it('keeps rich text editor surface as data-free Files UI', () => {
    expect(existsSync(uiRichTextEditorPath)).toBe(true)
    expect(existsSync(richTextEditorShimPath)).toBe(true)
    expect(existsSync(uiRichTextEditorModelPath)).toBe(true)
    if (!existsSync(uiRichTextEditorPath) || !existsSync(richTextEditorShimPath) || !existsSync(uiRichTextEditorModelPath)) return

    const uiSource = readFileSync(uiRichTextEditorPath, 'utf8')
    const modelSource = readFileSync(uiRichTextEditorModelPath, 'utf8')
    const shimSource = readFileSync(richTextEditorShimPath, 'utf8')
    const editorSheetSource = readFileSync(editorSheetPath, 'utf8')
    const sourceLinkedCardPreviewSource = readFileSync(sourceLinkedCardPreviewPath, 'utf8')

    expect(uiSource).toMatch(/\nexport function RichTextFileEditor\(/)
    expect(uiSource).toContain("from './rich-text-file-editor-model'")
    expect(uiSource).not.toContain('const [isDirty, setIsDirty]')
    expect(uiSource).not.toContain("useState<'saved' | 'dirty' | 'saving' | 'error'>")
    expect(uiSource).not.toContain('const [linkMenuOpen, setLinkMenuOpen]')
    expect(uiSource).not.toContain('const [linkHref, setLinkHref]')
    expect(uiSource).not.toContain('const [blockMenuOpen, setBlockMenuOpen]')
    expect(uiSource).not.toContain('const [blockMenuActiveIndex, setBlockMenuActiveIndex]')
    expect(uiSource).not.toContain('const [blockMoveMenuOpen, setBlockMoveMenuOpen]')
    expect(uiSource).toContain('export type RichTextEditorContent')
    expect(uiSource).toContain('RichTextEditorDocumentSummary')
    expect(uiSource).toContain('extractRichTextEditorDocumentSummary')
    expect(uiSource).not.toContain('TiptapCardMetadata')
    expect(uiSource).not.toContain('extractTiptapCardMetadata')
    expect(uiSource).not.toContain('onSubmitAiProposal')
    expect(uiSource).not.toContain('aiProposalPending')
    expect(uiSource).toContain('onSubmitProposal')
    expect(uiSource).toContain('proposalPending')
    expect(uiSource).not.toContain('RichTextFileContent')
    expect(uiSource).not.toContain('FilesDetail')
    expect(uiSource).not.toContain("from '../browser'")
    expect(uiSource).not.toContain('mimeType')
    expect(uiSource).not.toContain('previewText')
    expect(uiSource).not.toContain('sourceText')
    expect(uiSource).not.toContain('linx-source')
    expect(uiSource).not.toContain('Ingest')
    expect(uiSource).not.toContain('AI 修改审批')
    expect(modelSource).toContain('projectRichTextEditorSaveStateAfterDirtyComparison')
    expect(modelSource).toContain('projectRichTextEditorLinkMenuToggled')
    expect(modelSource).toContain('projectRichTextEditorBlockCommandMenuMoved')
    expect(modelSource).toContain('projectRichTextEditorBlockMoveMenuToggled')
    expect(modelSource).toContain('export type RichTextEditorDocumentSummary')
    expect(modelSource).toContain('extractRichTextEditorDocumentSummary')
    expect(modelSource).not.toContain('from \'react\'')
    expect(modelSource).not.toContain('from "react"')
    expect(modelSource).not.toContain('FilesDetail')
    expect(modelSource).not.toContain('mimeType')
    expect(modelSource).not.toContain('sourceText')
    expect(shimSource).toMatch(/^export \* from '..\/ui\/RichTextFileEditor'\n?$/)
    expect(editorSheetSource).toContain("from '../../ui/RichTextFileEditor'")
    expect(editorSheetSource).toContain('content={editor.richEditorContent}')
    expect(sourceLinkedCardPreviewSource).toContain("from '../../ui/RichTextFileEditor'")
    expect(sourceLinkedCardPreviewSource).toContain('content={content.bodyRichEditorContent}')
    expect(editorSheetSource).not.toContain("from '../../components/RichTextFileEditor'")
    expect(sourceLinkedCardPreviewSource).not.toContain("from '../../components/RichTextFileEditor'")
  })

  it('keeps all files UI modules free of module data dependencies', () => {
    const uiFiles = listSourceFiles(uiRootPath)

    expect(uiFiles).toEqual(expect.arrayContaining([
      uiCompactTableShellPath,
      uiColumnHeaderPath,
      uiDetailPreviewPrimitivesPath,
      uiEmptyStatePath,
      uiRichTextEditorPath,
      uiRowPath,
      uiSheetPath,
    ]))

    for (const filePath of uiFiles) {
      const source = readFileSync(filePath, 'utf8')

      for (const pattern of forbiddenUiDependencyPatterns) {
        expect(source, `${filePath} must not match ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})
