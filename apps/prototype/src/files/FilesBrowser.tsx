import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Copy,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Link2,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { folderSamples } from './files-model'
import { FolderAddMenu, type FolderAddAction } from './files-ui'
import type { FileOpenSample, FilesFolderId, FilesSelection, FolderChildItem, IconType } from './files-types'
import { ConfirmSheet, Menu, RowActions, usePopover } from '../shared/ui'
import { useResourceOps, childKey, childPath, favoriteSampleFor } from './resource-ops'

interface FlatRow {
  id: string
  folderId: FilesFolderId
  child?: FolderChildItem
  depth: number
  isFolder: boolean
  isRoot: boolean
}

const treeRoots: FilesFolderId[] = ['data', 'vocab', 'files']

function sortChildren(children: FolderChildItem[]): FolderChildItem[] {
  return [...children].sort((left, right) => {
    const leftFolder = left.targetFolder ? 0 : 1
    const rightFolder = right.targetFolder ? 0 : 1
    if (leftFolder !== rightFolder) return leftFolder - rightFolder
    return left.name.localeCompare(right.name)
  })
}

export function FilesBrowser({
  folder,
  selection,
  openedChildName,
  mobileOpen = false,
  onMobileClose,
  onNavigate,
  onSelect,
  isFileFavorite,
  onToggleFileFavorite,
  notify,
}: {
  folder: FilesFolderId
  selection: FilesSelection
  openedChildName?: string | null
  mobileOpen?: boolean
  onMobileClose?: () => void
  onNavigate: (folder: FilesFolderId) => void
  onSelect: (selection: FilesSelection, child?: FolderChildItem) => void
  isFileFavorite?: (path: string) => boolean
  onToggleFileFavorite?: (file: FileOpenSample) => void
  notify?: (title: string, kind?: 'ok' | 'err') => void
}) {
  const [expanded, setExpanded] = useState<Set<FilesFolderId>>(() => {
    const initial = new Set<FilesFolderId>(['files'])
    if (selection === 'structuredVocab' || selection === 'structuredVocabShapes' || selection === 'structuredVocabNamespaces') {
      initial.add('vocab')
    }
    let cursor: FilesFolderId | undefined = folder
    const chain: FilesFolderId[] = []
    while (cursor) {
      chain.unshift(cursor)
      cursor = folderSamples[cursor].parent
    }
    chain.forEach((id) => initial.add(id))
    return initial
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [checkedKeys, setCheckedKeys] = useState<string[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const anchorRef = useRef<string | null>(null)
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([])
  const addPopover = usePopover('.browser-head, .add-menu')
  const ops = useResourceOps(folder, notify, { resetOnFolderChange: false })

  const flatRows: FlatRow[] = []
  const pushChildren = (folderId: FilesFolderId, depth: number) => {
    for (const child of sortChildren(ops.childrenOf(folderId))) {
      const id = childKey(folderId, child.name)
      flatRows.push({ id, folderId, child, depth, isFolder: Boolean(child.targetFolder), isRoot: false })
      if (child.targetFolder && expanded.has(child.targetFolder)) pushChildren(child.targetFolder, depth + 1)
    }
  }
  treeRoots.forEach((root) => {
    flatRows.push({ id: `folder:${root}`, folderId: root, depth: 0, isFolder: true, isRoot: true })
    if (expanded.has(root)) pushChildren(root, 1)
  })

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const searchResults: FlatRow[] = normalizedQuery
    ? treeRoots.flatMap((root) => {
        const matches: FlatRow[] = []
        const walk = (folderId: FilesFolderId) => {
          for (const child of sortChildren(ops.childrenOf(folderId))) {
            if (`${child.name} ${child.kind}`.toLowerCase().includes(normalizedQuery)) {
              matches.push({ id: childKey(folderId, child.name), folderId, child, depth: 0, isFolder: Boolean(child.targetFolder), isRoot: false })
            }
            if (child.targetFolder) walk(child.targetFolder)
          }
        }
        walk(root)
        return matches
      })
    : []
  const visibleRows = normalizedQuery ? searchResults : flatRows

  const activeRowId = focusId ?? (openedChildName ? childKey(folder, openedChildName) : null) ?? flatRows.find((row) => row.child?.targetSelection === selection)?.id ?? `folder:${folder}`

  useEffect(() => {
    setFocusId(null)
  }, [folder, selection])

  useEffect(() => {
    if (!menuFor) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null)
    }
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.browser-head, .row-menu')) return
      setMenuFor(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('mousedown', closeOnOutside)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('mousedown', closeOnOutside)
    }
  }, [menuFor])

  const toggleExpand = (folderId: FilesFolderId) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const openRow = (row: FlatRow) => {
    setMenuFor(null)
    setFocusId(row.id)
    anchorRef.current = row.id
    onMobileClose?.()
    if (row.isFolder) {
      const target = row.child?.targetFolder ?? row.folderId
      if (!expanded.has(target)) toggleExpand(target)
      onNavigate(target)
      return
    }
    if (row.child?.targetSelection) onSelect(row.child.targetSelection, row.child)
  }

  const clickRow = (row: FlatRow, event: React.MouseEvent) => {
    if (event.shiftKey && anchorRef.current) {
      event.preventDefault()
      const anchorIndex = visibleRows.findIndex((item) => item.id === anchorRef.current)
      const targetIndex = visibleRows.findIndex((item) => item.id === row.id)
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [from, to] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
        setCheckedKeys(visibleRows.slice(from, to + 1).filter((item) => !item.isRoot && item.child).map((item) => item.id))
        return
      }
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      if (!row.child) return
      anchorRef.current = row.id
      setCheckedKeys((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])
      return
    }
    setCheckedKeys([])
    openRow(row)
  }

  const runAddAction = (action: FolderAddAction) => {
    addPopover.close()
    if (action === 'new-doc') ops.openSheet({ kind: 'new-doc' })
    if (action === 'new-folder') ops.openSheet({ kind: 'new-folder' })
    if (action === 'upload-files') ops.addUploadedImage()
    if (action === 'upload-folder') notify?.('已上传文件夹（保留层级）')
    if (action === 'add-web') notify?.('已添加网页 · Ingest 准备中')
  }

  const confirmBatchDelete = () => {
    const grouped = new Map<FilesFolderId, string[]>()
    for (const id of checkedKeys) {
      const row = flatRows.find((item) => item.id === id)
      if (!row?.child) continue
      const names = grouped.get(row.folderId) ?? []
      names.push(row.child.name)
      grouped.set(row.folderId, names)
    }
    grouped.forEach((names, folderId) => ops.markDeleted(folderId, names))
    setCheckedKeys([])
    notify?.(`已删除 ${checkedKeys.length} 项`)
  }

  return (
    <section className={`list-pane browser-pane ${mobileOpen ? 'mobile-open' : ''}`} aria-label="文件树">
      <header className="list-header browser-head">
        <div className="search-pill">
          <Search size={14} />
          <input
            value={searchQuery}
            placeholder="搜索文件树"
            aria-label="搜索文件树"
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchQuery('')
            }}
          />
          {searchQuery ? (
            <button className="pill-clear" aria-label="清除搜索" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          ) : (
            <kbd>⌘K</kbd>
          )}
        </div>
        <button
          className={`icon-button ${addPopover.open ? 'filter-active' : ''}`}
          aria-label="新建或上传"
          title="新建或上传"
          aria-expanded={addPopover.open}
          onClick={addPopover.toggle}
        >
          <Plus size={17} />
        </button>
        {onMobileClose ? (
          <button className="mobile-tree-close" aria-label="关闭文件浏览" onClick={onMobileClose}>
            <X size={16} />
          </button>
        ) : null}
        {addPopover.open ? (
          <FolderAddMenu path={folderSamples[folder].path} onPick={runAddAction} />
        ) : null}
      </header>
      {checkedKeys.length > 0 ? (
        <div className="batch-bar" role="toolbar" aria-label="批量操作">
          <span>已选 {checkedKeys.length} 项</span>
          <button onClick={() => {
            notify?.(`已复制 ${checkedKeys.length} 个 URI`)
            setCheckedKeys([])
          }}><Copy size={13} /> 复制 URI</button>
          <button className="destructive" onClick={confirmBatchDelete}><Trash2 size={13} /> 删除</button>
          <button className="ghost" onClick={() => setCheckedKeys([])}>取消</button>
        </div>
      ) : null}
      <div
        className="list-scroll browser-list tree-mode"
        role="tree"
        aria-label="Pod 文件树"
        onKeyDown={(event) => {
          const currentIndex = visibleRows.findIndex((row) => row.id === activeRowId)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const delta = event.key === 'ArrowDown' ? 1 : -1
            const nextIndex = Math.min(Math.max(currentIndex + delta, 0), visibleRows.length - 1)
            const next = visibleRows[nextIndex]
            if (!next || nextIndex === currentIndex) return
            setFocusId(next.id)
            window.setTimeout(() => rowsRef.current[nextIndex]?.focus(), 0)
          }
          if (event.key === 'ArrowRight' && currentIndex >= 0) {
            const row = visibleRows[currentIndex]
            if (row?.isFolder && !expanded.has(row.child?.targetFolder ?? row.folderId)) toggleExpand(row.child?.targetFolder ?? row.folderId)
          }
          if (event.key === 'ArrowLeft' && currentIndex >= 0) {
            const row = visibleRows[currentIndex]
            if (row?.isFolder && expanded.has(row.child?.targetFolder ?? row.folderId)) toggleExpand(row.child?.targetFolder ?? row.folderId)
          }
          if (event.key === 'Enter' && currentIndex >= 0) {
            event.preventDefault()
            openRow(visibleRows[currentIndex])
          }
          if (event.key === 'Escape' && checkedKeys.length > 0) {
            setCheckedKeys([])
          }
        }}
      >
        {normalizedQuery && visibleRows.length === 0 ? (
          <div className="list-empty-hint">
            <p>没有匹配“{searchQuery}”的资源</p>
          </div>
        ) : null}
        {visibleRows.map((row, index) => {
          const active = row.id === activeRowId
          const checked = checkedKeys.includes(row.id)
          const favorited = row.child ? (isFileFavorite?.(childPath(row.folderId, row.child.name)) ?? false) : false
          const Icon = row.isFolder ? (row.child?.icon ?? FolderOpen) : row.child!.icon
          const label = row.isRoot ? folderSamples[row.folderId].name : row.child!.name
          const sub = row.child && normalizedQuery ? folderSamples[row.folderId].path : null
          const isExpanded = row.isFolder && expanded.has(row.child?.targetFolder ?? row.folderId)
          return (
            <div className="browser-row-wrap" key={row.id}>
              <button
                className={`tree-row ${active ? 'active' : ''} ${checked ? 'checked' : ''}`}
                role="treeitem"
                aria-selected={active}
                aria-expanded={row.isFolder ? isExpanded : undefined}
                tabIndex={active ? 0 : -1}
                style={{ paddingLeft: `${8 + row.depth * 14}px` }}
                ref={(el) => { rowsRef.current[index] = el }}
                onClick={(event) => clickRow(row, event)}
                onDoubleClick={() => openRow(row)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setFocusId(row.id)
                  setMenuFor(row.id)
                }}
              >
                <span
                  className={`tree-chevron ${row.isFolder ? '' : 'leaf'}`}
                  role={row.isFolder ? 'button' : undefined}
                  aria-label={row.isFolder ? (isExpanded ? '收起' : '展开') : undefined}
                  onClick={(event) => {
                    if (!row.isFolder) return
                    event.stopPropagation()
                    toggleExpand(row.child?.targetFolder ?? row.folderId)
                  }}
                >
                  {row.isFolder ? <ChevronRight size={13} className={isExpanded ? 'expanded' : ''} /> : null}
                </span>
                <span className="row-icon plain"><Icon size={15} /></span>
                <span className="tree-label">
                  <strong>{label}</strong>
                  {sub ? <small>{sub}</small> : null}
                </span>
                {row.child ? (
                  <RowActions
                    favorited={favorited}
                    menuOpen={menuFor === row.id}
                    onToggleFavorite={() => onToggleFileFavorite?.(favoriteSampleFor(row.child!, row.folderId))}
                    onToggleMenu={() => setMenuFor((current) => current === row.id ? null : row.id)}
                  />
                ) : null}
              </button>
              {menuFor === row.id ? (
                row.child ? (
                  <Menu
                    items={ops.rowMenuItems(row.child, () => openRow(row), row.folderId)}
                    label={`${label} 操作`}
                    onClose={() => setMenuFor(null)}
                  />
                ) : (
                  <Menu
                    items={[
                      { label: '打开', icon: FolderOpen, run: () => openRow(row) },
                      { label: '复制 URI', icon: Copy, run: () => notify?.('已复制 URI') },
                    ]}
                    label={`${label} 操作`}
                    onClose={() => setMenuFor(null)}
                  />
                )
              ) : null}
            </div>
          )
        })}
      </div>
      <footer className="browser-status">
        {normalizedQuery ? `${visibleRows.length} 个结果` : `${folderSamples[folder].name} · ${folderSamples[folder].meta[0]?.[1] ?? ''}`}
      </footer>
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
    </section>
  )
}
