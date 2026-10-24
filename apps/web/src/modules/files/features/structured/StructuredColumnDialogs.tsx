import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import {
  type StructuredColumnFilter,
  type StructuredColumnValueKind,
} from '../../domain/structured/structured-column-filter'
import { PREDICATE_VALUE_TYPE_OPTIONS } from '../../domain/structured/structured-predicate-draft'
import {
  projectStructuredColumnFilterDialogDraft,
  projectStructuredColumnTypeDialogCurrent,
  planStructuredColumnFilterDialogSubmit,
  type StructuredColumnFilterDialogDraft,
  type StructuredColumnFilterDialogMode,
} from './structured-column-dialog-model'

const inputClassName = 'h-8 rounded-md border border-border/50 bg-background px-2 text-sm outline-none focus:border-primary/50'

/** K6d 改显示的名字: the name shown in this table only; the property keeps its own name. */
export function StructuredColumnRenameDialog({
  currentLabel,
  onOpenChange,
  onRename,
  open,
  originalLabel,
}: {
  currentLabel: string
  onOpenChange: (open: boolean) => void
  onRename: (label: string) => void
  open: boolean
  /** The name the property has everywhere else; an empty name puts it back. */
  originalLabel: string
}) {
  const [draft, setDraft] = useState(currentLabel)
  useEffect(() => {
    if (open) setDraft(currentLabel)
  }, [currentLabel, open])
  const submit = () => {
    const next = draft.trim()
    onRename(next === originalLabel ? '' : next)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-column-dialog="rename" className="w-[min(380px,calc(100vw-32px))] gap-4 rounded-xl p-5">
        <DialogHeader>
          <DialogTitle>改显示的名字</DialogTitle>
          <DialogDescription>只改这张表里的名字，别的表格和卡片上的名字不变。</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">显示的名字</span>
          <input
            aria-label="显示的名字"
            autoFocus
            className={inputClassName}
            placeholder={originalLabel}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
        </label>
        <DialogFooter className="flex gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** K6d 改值的类型…: what the column holds. Values already on cards are kept as they are. */
export function StructuredColumnTypeDialog({
  columnLabel,
  currentType,
  onChangeType,
  onOpenChange,
  open,
}: {
  columnLabel: string
  currentType: string
  onChangeType: (type: string) => Promise<boolean> | boolean
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const current = projectStructuredColumnTypeDialogCurrent(currentType)
  const [selected, setSelected] = useState(current)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setSelected(current)
  }, [current, open])
  const submit = async () => {
    setBusy(true)
    try {
      const done = await onChangeType(selected)
      if (done !== false) onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-column-dialog="type" className="w-[min(420px,calc(100vw-32px))] gap-4 rounded-xl p-5">
        <DialogHeader>
          <DialogTitle>改“{columnLabel}”的值的类型</DialogTitle>
          <DialogDescription>已经填好的内容不会变，只改以后怎么填。别的表格用到这一列时也会跟着变。</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="值的类型" className="grid grid-cols-2 gap-1">
          {PREDICATE_VALUE_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected === option.value}
              className={cn(
                'flex h-9 items-center gap-2 rounded-md border px-2 text-left text-sm',
                selected === option.value ? 'border-primary bg-muted font-medium' : 'border-transparent hover:bg-muted/60',
              )}
              onClick={() => setSelected(option.value)}
            >
              <span aria-hidden="true" className="w-4 text-center text-xs text-muted-foreground">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>
        <DialogFooter className="flex gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={busy || selected === current} onClick={() => { void submit() }}>改成这个</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MODE_LABELS: Record<StructuredColumnFilterDialogMode, string> = {
  contains: '包含',
  range: '范围',
  empty: '没填',
  filled: '填了',
}

/** K6d 按它筛选 for columns that are not a short list of options: text, numbers, dates. */
export function StructuredColumnFilterDialog({
  columnLabel,
  filter,
  onApply,
  onOpenChange,
  open,
  predicate,
  valueKind,
}: {
  columnLabel: string
  filter?: StructuredColumnFilter
  onApply: (filter: StructuredColumnFilter | null) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  predicate: string
  valueKind: StructuredColumnValueKind
}) {
  const [draft, setDraft] = useState<StructuredColumnFilterDialogDraft>(() => projectStructuredColumnFilterDialogDraft(filter, valueKind))
  useEffect(() => {
    if (open) setDraft(projectStructuredColumnFilterDialogDraft(filter, valueKind))
  }, [filter, open, valueKind])
  const ranged = draft.mode === 'range'
  const modes: StructuredColumnFilterDialogMode[] = [valueKind === 'number' || valueKind === 'date' ? 'range' : 'contains', 'empty', 'filled']
  const inputType = valueKind === 'number' ? 'number' : valueKind === 'date' ? 'date' : 'text'
  const submit = () => {
    onApply(planStructuredColumnFilterDialogSubmit(draft, predicate))
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-column-dialog="filter" className="w-[min(380px,calc(100vw-32px))] gap-4 rounded-xl p-5">
        <DialogHeader>
          <DialogTitle>按“{columnLabel}”筛选</DialogTitle>
          <DialogDescription>只显示符合条件的行，数据不会被改动。</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="筛选条件" className="flex gap-1">
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={draft.mode === mode}
              className={cn(
                'h-8 rounded-md border px-3 text-sm',
                draft.mode === mode ? 'border-primary bg-muted font-medium' : 'border-transparent hover:bg-muted/60',
              )}
              onClick={() => setDraft((current) => ({ ...current, mode }))}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        {draft.mode === 'contains' ? (
          <input
            aria-label="包含的文字"
            autoFocus
            className={inputClassName}
            placeholder="输入要找的字"
            value={draft.text}
            onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit() } }}
          />
        ) : null}
        {ranged ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
            <input
              aria-label="最小值"
              type={inputType}
              className={inputClassName}
              placeholder={valueKind === 'date' ? '从' : '最小'}
              value={draft.min}
              onChange={(event) => setDraft((current) => ({ ...current, min: event.target.value }))}
            />
            <span className="text-muted-foreground">到</span>
            <input
              aria-label="最大值"
              type={inputType}
              className={inputClassName}
              placeholder={valueKind === 'date' ? '到' : '最大'}
              value={draft.max}
              onChange={(event) => setDraft((current) => ({ ...current, max: event.target.value }))}
            />
          </div>
        ) : null}
        <DialogFooter className="flex gap-2 sm:flex-row sm:justify-end">
          {filter ? (
            <Button variant="ghost" className="mr-auto" onClick={() => { onApply(null); onOpenChange(false) }}>清除筛选</Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit}>筛选</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
