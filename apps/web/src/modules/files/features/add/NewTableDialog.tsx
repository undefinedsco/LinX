import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { PREDICATE_VALUE_TYPE_OPTIONS } from '../../domain/structured/structured-predicate-draft'
import type { NewTableColumnInput } from '../../domain/structured/structured-new-table'

export interface NewTableDialogModel {
  open: boolean
  name: string
  columns: NewTableColumnInput[]
  pending: boolean
  message: string | null
  canCreate: boolean
  setName: (name: string) => void
  setColumn: (index: number, patch: Partial<NewTableColumnInput>) => void
  addColumn: () => void
  removeColumn: (index: number) => void
  cancel: () => void
  confirm: () => Promise<void>
}

/** K6b 加表: a name, where it goes, and the first few columns. */
export function NewTableDialog({ table, destinationLabel }: { table: NewTableDialogModel; destinationLabel: string }) {
  return (
    <Dialog open={table.open} onOpenChange={(open) => { if (!open) table.cancel() }}>
      <DialogContent data-new-table="true" className="w-[min(440px,calc(100vw-32px))] gap-4 rounded-xl p-5">
        <DialogHeader>
          <DialogTitle>新建表格</DialogTitle>
          <DialogDescription className="truncate">放在 {destinationLabel}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">名字</span>
          <input
            aria-label="表格名字"
            autoFocus
            className="h-8 rounded-md border border-border/50 bg-background px-2 text-sm outline-none focus:border-primary/50"
            placeholder="比如：供应商"
            value={table.name}
            onChange={(event) => table.setName(event.target.value)}
          />
        </label>
        <div className="grid gap-2 text-xs">
          <span className="text-muted-foreground">先有哪几列（以后随时加）</span>
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
            名称<span className="ml-auto text-xs text-muted-foreground">每张表都有</span>
          </div>
          {table.columns.map((column, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                aria-label={`第 ${index + 1} 列的名字`}
                className="h-8 min-w-0 flex-1 rounded-md border border-border/50 bg-background px-2 text-sm outline-none focus:border-primary/50"
                placeholder="列名，比如：电话"
                value={column.label}
                onChange={(event) => table.setColumn(index, { label: event.target.value })}
              />
              <select
                aria-label={`第 ${index + 1} 列的类型`}
                className="h-8 rounded-md border border-border/50 bg-background px-1 text-xs"
                value={column.type}
                onChange={(event) => table.setColumn(index, { type: event.target.value })}
              >
                {PREDICATE_VALUE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.icon} {option.label}</option>
                ))}
              </select>
              <Button size="icon" variant="ghost" aria-label="去掉这一列" onClick={() => table.removeColumn(index)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="justify-start" onClick={table.addColumn}><Plus className="mr-1 h-3.5 w-3.5" />加一列</Button>
        </div>
        <p className="text-xs text-muted-foreground">类型和列会放进“词表”，别的表格也能用。</p>
        {table.message ? <p role="alert" className="text-xs text-destructive">{table.message}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={table.pending} onClick={table.cancel}>取消</Button>
          <Button disabled={!table.canCreate} onClick={() => { void table.confirm() }}>创建</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
