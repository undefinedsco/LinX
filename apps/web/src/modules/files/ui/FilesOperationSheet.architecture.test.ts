import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const uiSheetPath = 'src/modules/files/ui/FilesOperationSheet.tsx'
const uiCompactTableShellPath = 'src/modules/files/ui/CompactTableShell.tsx'
const compactTableShellShimPath = 'src/modules/files/components/CompactTableShell.tsx'
const uiDetailPreviewPrimitivesPath = 'src/modules/files/ui/FileDetailPreviewPrimitives.tsx'
const uiEmptyStatePath = 'src/modules/files/ui/FilesEmptyState.tsx'
const uiRowPath = 'src/modules/files/ui/FilesListRow.tsx'
const uiColumnHeaderPath = 'src/modules/files/ui/FilesListColumnHeader.tsx'
const uiExplorerRowPath = 'src/modules/files/ui/FilesExplorerRow.tsx'
const uiExplorerRowTypesPath = 'src/modules/files/ui/files-explorer-row-types.ts'
const uiBlockNoteEditorPath = 'src/modules/files/ui/BlockNoteFileEditor.tsx'
const uiRichTextEditorModelPath = 'src/modules/files/ui/rich-text-file-editor-model.ts'
const uiRootPath = 'src/modules/files/ui'
const listPanePath = 'src/modules/files/features/list/FilesListPane.tsx'
const editorSheetPath = 'src/modules/files/features/editor/FileEditorSurface.tsx'
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

  it('keeps explorer row as data-free Files UI', () => {
    expect(existsSync(uiExplorerRowPath)).toBe(true)
    expect(existsSync(uiExplorerRowTypesPath)).toBe(true)
    if (!existsSync(uiExplorerRowPath) || !existsSync(uiExplorerRowTypesPath)) return

    const uiSource = readFileSync(uiExplorerRowPath, 'utf8')
    const uiTypesSource = readFileSync(uiExplorerRowTypesPath, 'utf8')
    const listPaneSource = readFileSync(listPanePath, 'utf8')

    expect(uiSource).toMatch(/\nexport function FilesExplorerRow\(/)
    expect(uiSource).toContain("from './files-explorer-row-types'")
    expect(uiTypesSource).toContain("export type FilesExplorerRowOpenTrigger = 'double-click' | 'enter'")
    expect(uiSource).not.toContain('FilesEntry')
    expect(uiSource).not.toContain('getFilesEntrySemanticLabel')
    expect(uiSource).not.toContain("'container'")
    expect(uiSource).not.toContain("'resource'")
    expect(uiSource).not.toContain("kind === 'container'")
    expect(listPaneSource).toContain("from '../../ui/FilesExplorerRow'")
    expect(listPaneSource).not.toMatch(/\nfunction FileRow\(/)
  })

  it('allows legacy list column header to remain data-free Files UI without requiring explorer reuse', () => {
    expect(existsSync(uiColumnHeaderPath)).toBe(true)
    if (!existsSync(uiColumnHeaderPath)) return

    const uiSource = readFileSync(uiColumnHeaderPath, 'utf8')

    expect(uiSource).toMatch(/\nexport function FilesListColumnHeader(?:<[^>]+>)?\(/)
    expect(uiSource).not.toContain('useFilesStore')
    expect(uiSource).not.toContain('FileSortField')
    expect(uiSource).not.toContain('FilesListColumnSortField')
    expect(uiSource).not.toContain("'mimeType'")
    expect(uiSource).not.toContain("'modifiedAt'")
    expect(uiSource).not.toMatch(/onSort\('[^']+'\)/)
    expect(uiSource).not.toMatch(/field="[^"]+"/)
  })

  it('keeps block note editor surface as data-free Files UI', () => {
    expect(existsSync(uiBlockNoteEditorPath)).toBe(true)
    expect(existsSync(uiRichTextEditorModelPath)).toBe(true)
    if (!existsSync(uiBlockNoteEditorPath) || !existsSync(uiRichTextEditorModelPath)) return

    const uiSource = readFileSync(uiBlockNoteEditorPath, 'utf8')
    const modelSource = readFileSync(uiRichTextEditorModelPath, 'utf8')
    const editorSheetSource = readFileSync(editorSheetPath, 'utf8')
    const sourceLinkedCardPreviewSource = readFileSync(sourceLinkedCardPreviewPath, 'utf8')

    expect(uiSource).toMatch(/\nexport function BlockNoteFileEditor\(/)
    expect(uiSource).toContain("from './rich-text-file-editor-model'")
    expect(uiSource).toContain('export type BlockNoteEditorContent')
    expect(uiSource).toContain('RichTextEditorDocumentSummary')
    expect(uiSource).toContain('onSubmitProposal')
    expect(uiSource).toContain('proposalPending')
    expect(uiSource).not.toContain('FilesDetail')
    expect(uiSource).not.toContain("from '../browser'")
    expect(uiSource).not.toContain('mimeType')
    expect(uiSource).not.toContain('previewText')
    expect(uiSource).not.toContain('sourceText')
    expect(uiSource).not.toContain('linx-source')
    expect(uiSource).not.toContain('Ingest')
    expect(modelSource).toContain('projectRichTextEditorSaveStateAfterDirtyComparison')
    expect(modelSource).toContain('export type RichTextEditorDocumentSummary')
    expect(modelSource).not.toContain('from \'react\'')
    expect(modelSource).not.toContain('from "react"')
    expect(modelSource).not.toContain('FilesDetail')
    expect(modelSource).not.toContain('mimeType')
    expect(modelSource).not.toContain('sourceText')
    expect(editorSheetSource).toContain("from '@/modules/files/ui/BlockNoteFileEditor'")
    expect(editorSheetSource).toContain('content={editor.richEditorContent}')
    expect(sourceLinkedCardPreviewSource).toContain("from '@/modules/files/ui/BlockNoteFileEditor'")
    expect(sourceLinkedCardPreviewSource).toContain('content={content.bodyRichEditorContent}')
    expect(editorSheetSource).not.toContain("from '../../ui/RichTextFileEditor'")
    expect(sourceLinkedCardPreviewSource).not.toContain("from '../../ui/RichTextFileEditor'")
  })

  it('keeps all files UI modules free of module data dependencies', () => {
    const uiFiles = listSourceFiles(uiRootPath)

    expect(uiFiles).toEqual(expect.arrayContaining([
      uiCompactTableShellPath,
      uiColumnHeaderPath,
      uiDetailPreviewPrimitivesPath,
      uiEmptyStatePath,
      uiExplorerRowPath,
      uiExplorerRowTypesPath,
      uiBlockNoteEditorPath,
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
