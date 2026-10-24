import { useState } from 'react'
import { Plus } from 'lucide-react'

import type { StructuredSubjectCreationFooterModel } from './structured-subject-creation-model'

export function StructuredSubjectCreationFooterRow({
  disabled,
  footerModel,
  footerPredicates,
  onOpen,
  onAddByName,
  title,
}: {
  disabled: boolean
  footerModel: StructuredSubjectCreationFooterModel
  footerPredicates: readonly string[]
  onOpen: () => void
  /** R6 K6b: type a name in the last row and press Enter to add a card; Enter again for the next one. */
  onAddByName?: (name: string) => boolean
  title: string
}) {
  const [draft, setDraft] = useState('')
  return (
    <tr>
      <td className="px-2 py-1 font-medium text-foreground/80">
        {onAddByName ? (
          <div className="flex items-center gap-1">
            <input
              aria-label="新的一行"
              placeholder="新的一行，打名字后回车"
              title={title}
              disabled={disabled}
              value={draft}
              className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[11px] font-normal outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                event.preventDefault()
                if (onAddByName(draft)) setDraft('')
              }}
            />
          </div>
        ) : null}
        <button
          aria-label={footerModel.buttonAriaLabel}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-primary hover:bg-primary/10"
          disabled={disabled}
          title={title}
          onClick={onOpen}
        >
          <Plus className="h-3.5 w-3.5" />
          {footerModel.buttonLabel}
        </button>
      </td>
      {footerPredicates.map((predicate) => (
        <td key={predicate} className="border-l border-border/5 px-1.5 py-0.5 text-muted-foreground/30"> </td>
      ))}
      <td className="border-l border-border/5 px-1.5 py-0.5 text-muted-foreground/30"> </td>
    </tr>
  )
}
