import { useEffect, useState } from 'react'
import { Copy, FilePlus2, FolderInput, FolderOpen, Image, Pencil, Trash2 } from 'lucide-react'
import { folderSamples } from './files-model'
import type { FileOpenSample, FilesFolderId, FolderChildItem } from './files-types'
import type { MenuItem } from '../shared/ui'

export type OpsSheetState =
  | { kind: 'rename' | 'delete' | 'move'; child: FolderChildItem }
  | { kind: 'delete-batch'; names: string[] }
  | { kind: 'new-doc' | 'new-folder' }
  | null

export function childKey(folderId: FilesFolderId, name: string) {
  return `${folderId}/${name}`
}

export function childPath(folderId: FilesFolderId, name: string) {
  return `${folderSamples[folderId].path}${name}`
}

export function favoriteSampleFor(child: FolderChildItem, folderId: FilesFolderId): FileOpenSample {
  const facts = child.detail.split('·').map((part) => part.trim())
  return {
    id: child.targetSelection === 'image' ? 'image' : child.targetSelection === 'jsonl' ? 'jsonl' : 'document',
    name: child.name,
    path: childPath(folderId, child.name),
    kind: child.kind,
    summary: `${child.name} · ${child.detail}`,
    icon: child.icon,
    meta: [
      ['format', child.kind],
      ['size', facts[0] ?? '—'],
      ['modified', facts[1] ?? '—'],
      ['permission', 'Private'],
    ],
  }
}

export function useResourceOps(
  folder: FilesFolderId,
  notify?: (title: string, kind?: 'ok' | 'err') => void,
  options?: { resetOnFolderChange?: boolean },
) {
  const [renamed, setRenamed] = useState<Record<string, string>>({})
  const [deletedKeys, setDeletedKeys] = useState<string[]>([])
  const [addedChildren, setAddedChildren] = useState<Partial<Record<FilesFolderId, FolderChildItem[]>>>({})
  const [sheet, setSheet] = useState<OpsSheetState>(null)
  const [sheetFolder, setSheetFolder] = useState<FilesFolderId>(folder)
  const [sheetValue, setSheetValue] = useState('')

  useEffect(() => {
    if (options?.resetOnFolderChange === false) return
    setRenamed({})
    setDeletedKeys([])
    setAddedChildren({})
    setSheet(null)
  }, [folder, options?.resetOnFolderChange])

  const childrenOf = (folderId: FilesFolderId): FolderChildItem[] => {
    const base = folderSamples[folderId].children
      .filter((child) => !deletedKeys.includes(childKey(folderId, child.name)))
      .map((child) => {
        const next = renamed[childKey(folderId, child.name)]
        return next ? { ...child, name: next } : child
      })
    return [...base, ...(addedChildren[folderId] ?? [])]
  }

  const openSheet = (next: OpsSheetState, folderOverride?: FilesFolderId) => {
    setSheet(next)
    setSheetFolder(folderOverride ?? folder)
    if (next?.kind === 'rename') setSheetValue(next.child.name)
    else if (next?.kind === 'move') setSheetValue(`${folderSamples[folderOverride ?? folder].path}${next.child.name}`)
    else if (next?.kind === 'new-doc') setSheetValue('未命名.md')
    else if (next?.kind === 'new-folder') setSheetValue('新建文件夹')
    else setSheetValue('')
  }

  const sheetError = (() => {
    if (!sheet) return ''
    const value = sheetValue.trim()
    const siblings = childrenOf(sheetFolder)
    if (sheet.kind === 'rename') {
      if (value === sheet.child.name) return '名称没有变化'
      if (siblings.some((child) => child.name === value)) return '当前文件夹已有同名资源'
      if (value.includes('/')) return '名称不能包含路径或离开当前文件夹'
      return ''
    }
    if (sheet.kind === 'move') {
      if (value === `${folderSamples[sheetFolder].path}${sheet.child.name}`) return '目标路径没有变化'
      if (!value.startsWith('/')) return '只能移动到当前 Pod 内的位置'
      return ''
    }
    if (sheet.kind === 'new-doc' || sheet.kind === 'new-folder') {
      if (!value) return '名称不能为空'
      if (siblings.some((child) => child.name === value)) return '当前文件夹已有同名资源'
      if (value.includes('/')) return '名称不能包含路径或离开当前文件夹'
      return ''
    }
    return ''
  })()

  const confirmSheet = () => {
    if (!sheet || sheetError) return
    const value = sheetValue.trim()
    if (sheet.kind === 'rename') {
      setRenamed((current) => ({ ...current, [childKey(sheetFolder, sheet.child.name)]: value }))
      notify?.('重命名已开始')
    }
    if (sheet.kind === 'delete') {
      setDeletedKeys((current) => [...current, childKey(sheetFolder, sheet.child.name)])
      notify?.('文件已删除')
    }
    if (sheet.kind === 'delete-batch') {
      setDeletedKeys((current) => [...current, ...sheet.names.map((name) => childKey(sheetFolder, name))])
      notify?.(`已删除 ${sheet.names.length} 项`)
    }
    if (sheet.kind === 'move') {
      setDeletedKeys((current) => [...current, childKey(sheetFolder, sheet.child.name)])
      notify?.('文件移动已开始')
    }
    if (sheet.kind === 'new-doc') {
      setAddedChildren((current) => ({ ...current, [sheetFolder]: [...(current[sheetFolder] ?? []), { name: value, kind: 'Markdown', icon: FilePlus2, detail: '0 KB · 刚刚', targetSelection: 'document' }] }))
      notify?.('文件已创建')
    }
    if (sheet.kind === 'new-folder') {
      setAddedChildren((current) => ({ ...current, [sheetFolder]: [...(current[sheetFolder] ?? []), { name: value, kind: 'Folder', icon: FolderOpen, detail: '0 项 · 刚刚' }] }))
      notify?.('文件夹已创建')
    }
    setSheet(null)
  }

  const markDeleted = (folderId: FilesFolderId, names: string[]) => {
    setDeletedKeys((current) => [...current, ...names.map((name) => childKey(folderId, name))])
  }

  const addUploadedImage = () => {
    setAddedChildren((current) => ({ ...current, [folder]: [...(current[folder] ?? []), { name: 'evidence-01.png', kind: 'Image', icon: Image, detail: '312 KB · 刚刚', targetSelection: 'image' }] }))
    notify?.('已上传 1 个文件')
  }

  const rowMenuItems = (child: FolderChildItem, onOpen: (child: FolderChildItem) => void, childFolder?: FilesFolderId): MenuItem[] => [
    { label: '打开', icon: FolderOpen, run: () => onOpen(child) },
    { label: '复制 URI', icon: Copy, run: () => notify?.('已复制 URI') },
    { label: '重命名', icon: Pencil, run: () => openSheet({ kind: 'rename', child }, childFolder) },
    { label: '移动到...', icon: FolderInput, run: () => openSheet({ kind: 'move', child }, childFolder) },
    { label: '删除', icon: Trash2, destructive: true, run: () => openSheet({ kind: 'delete', child }, childFolder) },
  ]

  const sheetMeta = sheet
    ? {
        title: sheet.kind === 'rename' ? '重命名'
          : sheet.kind === 'delete' ? '删除 1 项'
          : sheet.kind === 'delete-batch' ? `删除 ${sheet.names.length} 项`
          : sheet.kind === 'move' ? '移动到'
          : sheet.kind === 'new-doc' ? '新建 Markdown 文件'
          : '新建文件夹',
        description: sheet.kind === 'rename' ? `${folderSamples[folder].path}${sheet.child.name}`
          : sheet.kind === 'delete' ? `删除“${sheet.child.name}”？`
          : sheet.kind === 'delete-batch' ? `删除：${sheet.names.join('、')}？`
          : sheet.kind === 'move' ? `将“${sheet.child.name}”移动到：`
          : `在 ${folderSamples[folder].path} 中创建。`,
        confirmLabel: sheet.kind === 'delete' || sheet.kind === 'delete-batch' ? '删除'
          : sheet.kind === 'rename' ? '重命名'
          : sheet.kind === 'move' ? '移动'
          : '创建',
        destructive: sheet.kind === 'delete' || sheet.kind === 'delete-batch',
        hasInput: sheet.kind === 'rename' || sheet.kind === 'move' || sheet.kind === 'new-doc' || sheet.kind === 'new-folder',
      }
    : null

  return {
    childrenOf,
    sheet,
    sheetMeta,
    sheetValue,
    setSheetValue,
    sheetError,
    openSheet,
    closeSheet: () => setSheet(null),
    confirmSheet,
    markDeleted,
    addUploadedImage,
    rowMenuItems,
  }
}
