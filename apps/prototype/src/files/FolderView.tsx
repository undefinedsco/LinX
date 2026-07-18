import { useState } from 'react'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronRight,
  Database,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Link2,
  List,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Star,
  Upload,
} from 'lucide-react'
import { FileDetailModal, type FilePropertyState } from './FileEditorSheet'
import type { FileOpenSample, FolderChildItem, FolderOpenSample, IconType, StoredFileContent } from './files-types'
import { AccessPolicyDialog } from './ResourceSidecars'
import { AccessIconButton, FilePageHeader, FolderAddMenu, MetaToggleButton, ViewTabs, type FolderAddAction } from './files-ui'
import { ConfirmSheet, Menu, RowActions, usePopover } from '../shared/ui'
import { useResourceOps, favoriteSampleFor } from './resource-ops'

type FolderSortKey = 'name' | 'kind' | 'size' | 'modified' | 'permission'

const folderTableColumns: Array<{ id: FolderSortKey; label: string; width: number }> = [
  { id: 'name', label: '名称', width: 280 },
  { id: 'kind', label: '类型', width: 110 },
  { id: 'size', label: '大小', width: 90 },
  { id: 'modified', label: '修改时间', width: 140 },
  { id: 'permission', label: '权限', width: 100 },
]

function childFacts(child: FolderChildItem): { size: string; modified: string; permission: string } {
  const parts = child.detail.split('·').map((part) => part.trim())
  return {
    size: parts[0] ?? '—',
    modified: parts[1] ?? '—',
    permission: 'Private',
  }
}

function sizeRank(size: string): number {
  const match = size.match(/(\d+(?:\.\d+)?)\s*(KB|MB|B)/i)
  if (!match) return -1
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  if (unit === 'MB') return value * 1024
  if (unit === 'B') return value / 1024
  return value
}

export function FolderOverview({
  folder,
  detailOpen,
  onToggleDetail,
  onOpenChild,
  fileContentsByPath,
  filePropertiesByPath,
  onChangeFileContent,
  onChangeFileProperties,
  isFileFavorite,
  onToggleFileFavorite,
  notify,
}: {
  folder: FolderOpenSample
  detailOpen: boolean
  onToggleDetail: () => void
  onOpenChild?: (child: FolderChildItem) => void
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  isFileFavorite?: (path: string) => boolean
  onToggleFileFavorite?: (file: FileOpenSample) => void
  notify?: (title: string, kind?: 'ok' | 'err') => void
}) {
  const [accessOpen, setAccessOpen] = useState(false)
  const [newDocOpen, setNewDocOpen] = useState(false)
  const [folderView, setFolderView] = useState<'table' | 'grid'>('table')
  const [sortKey, setSortKey] = useState<FolderSortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [focusName, setFocusName] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const addPopover = usePopover('.folder-add-anchor, .add-menu')
  const ops = useResourceOps(folder.id, notify)

  const children = ops.childrenOf(folder.id)
  const sortedChildren = [...children].sort((left, right) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'kind') return left.kind.localeCompare(right.kind) * dir || left.name.localeCompare(right.name)
    if (sortKey === 'size') return (sizeRank(childFacts(left).size) - sizeRank(childFacts(right).size)) * dir
    if (sortKey === 'modified') return childFacts(left).modified.localeCompare(childFacts(right).modified) * dir
    if (sortKey === 'permission') return childFacts(left).permission.localeCompare(childFacts(right).permission) * dir
    return left.name.localeCompare(right.name) * dir
  })

  const gridStyle = {
    '--schema-template': folderTableColumns.map((column) => `${column.width}px`).join(' '),
    '--schema-min-width': `${folderTableColumns.reduce((sum, column) => sum + column.width, 0)}px`,
    '--schema-row-height': '34px',
    '--schema-cell-gap': '0px',
    '--schema-row-padding': '0 10px',
  } as React.CSSProperties

  const newDocFile: FileOpenSample = {
    id: 'document',
    name: '未命名.md',
    path: `${folder.path}未命名.md`,
    kind: 'Markdown document',
    summary: `在 ${folder.path} 中新建的文档。`,
    icon: FilePlus2,
    meta: [
      ['format', 'text/markdown'],
      ['size', '0 KB'],
      ['modified', '刚刚'],
      ['permission', 'Private'],
    ],
  }

  const openChild = (child: FolderChildItem) => {
    setMenuFor(null)
    onOpenChild?.(child)
  }

  const toggleFavorite = (child: FolderChildItem) => {
    onToggleFileFavorite?.(favoriteSampleFor(child, folder.id))
  }

  const runAddAction = (action: FolderAddAction) => {
    addPopover.close()
    if (action === 'new-doc') setNewDocOpen(true)
    if (action === 'new-folder') ops.openSheet({ kind: 'new-folder' })
    if (action === 'upload-files') ops.addUploadedImage()
    if (action === 'upload-folder') notify?.('已上传文件夹（保留层级）')
    if (action === 'add-web') notify?.('已添加网页 · Ingest 准备中')
  }

  const rowOps = (child: FolderChildItem) => (
    <RowActions
      favorited={isFileFavorite?.(`${folder.path}${child.name}`) ?? false}
      menuOpen={menuFor === child.name}
      onToggleFavorite={() => toggleFavorite(child)}
      onToggleMenu={() => setMenuFor((current) => current === child.name ? null : child.name)}
    />
  )

  const addAnchor = (
    <div className="folder-add-anchor">
      <button className="folder-add-row" onClick={addPopover.toggle} aria-expanded={addPopover.open}>
        <Plus size={14} />
        <span>添加</span>
      </button>
      {addPopover.open ? (
        <FolderAddMenu path={folder.path} className="folder-add-menu" onPick={runAddAction} />
      ) : null}
    </div>
  )

  const emptyHint = <p>当前文件夹为空。用下面的 + 添加新建或上传资源。</p>

  return (
    <main className="work-pane files-work file-open-work">
      <FilePageHeader title={folder.name} subtitle={`${folder.kind} · ${folder.path}`}>
        <AccessIconButton onClick={() => setAccessOpen(true)} />
        <MetaToggleButton open={detailOpen} onToggle={onToggleDetail} />
      </FilePageHeader>
      <section className="resource-viewbar folder-viewbar">
        <ViewTabs
          ariaLabel="文件夹视图"
          views={[
            { id: 'table', label: 'Table', icon: Database },
            { id: 'grid', label: 'Grid', icon: LayoutGrid },
          ]}
          active={folderView}
          onChange={(id) => setFolderView(id as 'table' | 'grid')}
        />
      </section>
      {folderView === 'grid' ? (
        <section className="structured-table compact-table folder-table">
          <div className="folder-grid-view">
            {sortedChildren.length === 0 ? <div className="folder-table-empty">{emptyHint}</div> : null}
            {sortedChildren.map((child) => {
              const Icon = child.icon
              const active = child.name === focusName
              return (
                <div className="folder-row-wrap" key={child.name}>
                  <button
                    className={`folder-grid-card ${active ? 'active' : ''}`}
                    title={child.name}
                    onClick={() => {
                      setFocusName(child.name)
                      openChild(child)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setFocusName(child.name)
                      setMenuFor(child.name)
                    }}
                  >
                    <Icon size={44} strokeWidth={1.3} />
                    <strong>{child.name}</strong>
                  </button>
                  {menuFor === child.name ? (
                    <Menu items={ops.rowMenuItems(child, openChild)} label={`${child.name} 操作`} onClose={() => setMenuFor(null)} />
                  ) : null}
                </div>
              )
            })}
            <div className="folder-add-anchor">
              <button className="folder-grid-add" onClick={addPopover.toggle} aria-expanded={addPopover.open} aria-label="新建或上传">
                <span className="grid-add-icon"><Plus size={20} /></span>
              </button>
              {addPopover.open ? (
                <FolderAddMenu path={folder.path} className="folder-add-menu" onPick={runAddAction} />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {folderView === 'table' ? (
        <section className="structured-table compact-table folder-table">
          <div className="subject-grid" style={gridStyle}>
            <div className="subject-head">
              {folderTableColumns.map((column) => (
                <span className="schema-head-label compact-head-label" key={column.id}>
                  <button
                    className={`folder-sort-button ${sortKey === column.id ? 'active' : ''}`}
                    onClick={() => {
                      if (sortKey === column.id) setSortDir((dir) => dir === 'asc' ? 'desc' : 'asc')
                      else {
                        setSortKey(column.id)
                        setSortDir('asc')
                      }
                    }}
                  >
                    {column.label}
                    {sortKey === column.id ? (sortDir === 'asc' ? <ArrowDownAZ size={13} /> : <ArrowUpAZ size={13} />) : null}
                  </button>
                </span>
              ))}
            </div>
            {sortedChildren.length === 0 ? <div className="folder-table-empty">{emptyHint}</div> : null}
            {sortedChildren.map((child, index) => {
              const Icon = child.icon
              const facts = childFacts(child)
              const active = child.name === focusName
              return (
                <div className="folder-row-wrap" key={child.name}>
                  <button
                    className={`subject-row folder-table-row ${active ? 'active' : ''}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => {
                      setFocusName(child.name)
                      openChild(child)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') openChild(child)
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault()
                        const delta = event.key === 'ArrowDown' ? 1 : -1
                        const nextIndex = Math.min(Math.max(index + delta, 0), sortedChildren.length - 1)
                        setFocusName(sortedChildren[nextIndex]?.name ?? null)
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setFocusName(child.name)
                      setMenuFor(child.name)
                    }}
                  >
                    <span className="folder-cell-name">
                      <Icon size={15} />
                      <strong>{child.name}</strong>
                      {child.targetFolder ? <ChevronRight size={13} className="folder-cell-enter" /> : null}
                    </span>
                    <span>{child.kind}</span>
                    <span>{facts.size}</span>
                    <span>{facts.modified}</span>
                    <span className="folder-cell-tail">
                      <em>{facts.permission}</em>
                      {rowOps(child)}
                    </span>
                  </button>
                  {menuFor === child.name ? (
                    <Menu items={ops.rowMenuItems(child, openChild)} label={`${child.name} 操作`} onClose={() => setMenuFor(null)} />
                  ) : null}
                </div>
              )
            })}
            {addAnchor}
          </div>
        </section>
      ) : null}
      <footer className="table-status">{folder.meta[0]?.[1]} · {folder.meta[1]?.[1]} · {folder.meta[2]?.[1]}</footer>
      {newDocOpen ? (
        <FileDetailModal
          content={fileContentsByPath?.[newDocFile.path]}
          file={newDocFile}
          fileProperties={filePropertiesByPath?.[newDocFile.path]}
          isFavorite={isFileFavorite?.(newDocFile.path)}
          onChangeContent={(content) => onChangeFileContent?.(newDocFile.path, content)}
          onChangeFileProperties={(properties) => onChangeFileProperties?.(newDocFile.path, properties)}
          onClose={() => setNewDocOpen(false)}
          onToggleFavorite={onToggleFileFavorite}
          notify={notify}
        />
      ) : null}
      {accessOpen ? <AccessPolicyDialog scope="Folder" onClose={() => setAccessOpen(false)} /> : null}
      {ops.sheet && ops.sheetMeta ? (
        <ConfirmSheet
          title={ops.sheetMeta.title}
          description={ops.sheetMeta.description}
          confirmLabel={ops.sheetMeta.confirmLabel}
          destructive={ops.sheetMeta.destructive}
          error={ops.sheetError || undefined}
          input={ops.sheetMeta.hasInput ? {
            ariaLabel: ops.sheet.kind === 'move' ? '目标路径' : '新名称',
            value: ops.sheetValue,
            onChange: ops.setSheetValue,
          } : undefined}
          onCancel={ops.closeSheet}
          onConfirm={ops.confirmSheet}
        />
      ) : null}
    </main>
  )
}
