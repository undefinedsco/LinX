/**
 * DiffPreview - Inline diff preview for file write operations
 *
 * Section 7.4: Renders unified diff inside CLI session message flow.
 *
 * Style spec (section 7.4):
 * - Background: bg-muted/30
 * - Deleted lines: bg-red-500/10 text-red-600
 * - Added lines: bg-green-500/10 text-green-600
 * - Font: font-mono text-xs
 * - Collapse diffs > 10 lines by default, show "展开 N 行变更"
 *
 * CP0: contract types + rendering skeleton.
 */

import { memo, useState, useMemo } from 'react'
import { ChevronDown, FileEdit } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// Types (contract)
// ============================================================================

export interface DiffLine {
  /** Line number in the new file (null for deleted lines) */
  newLineNo?: number
  /** Line number in the old file (null for added lines) */
  oldLineNo?: number
  /** Line type */
  type: 'add' | 'delete' | 'context'
  /** Line content (without +/- prefix) */
  content: string
}

export interface DiffPreviewProps {
  /** File path being modified */
  filePath: string
  /** Parsed diff lines */
  lines: DiffLine[]
  /** Max visible lines before collapsing (default 10) */
  collapseThreshold?: number
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

function parseDiffText(raw: string): DiffLine[] {
  return raw.split('\n').map((line, idx) => {
    if (line.startsWith('+')) {
      return { type: 'add' as const, content: line.slice(1), newLineNo: idx + 1 }
    }
    if (line.startsWith('-')) {
      return { type: 'delete' as const, content: line.slice(1), oldLineNo: idx + 1 }
    }
    return { type: 'context' as const, content: line, oldLineNo: idx + 1, newLineNo: idx + 1 }
  })
}

// ============================================================================
// Component
// ============================================================================

export const DiffPreview = memo<DiffPreviewProps>(
  ({ filePath, lines, collapseThreshold = 10, className }) => {
    const shouldCollapse = lines.length > collapseThreshold
    const [isExpanded, setIsExpanded] = useState(!shouldCollapse)

    const visibleLines = useMemo(() => {
      if (isExpanded) return lines
      return lines.slice(0, collapseThreshold)
    }, [lines, isExpanded, collapseThreshold])

    const hiddenCount = lines.length - collapseThreshold

    return (
      <div
        className={cn(
          'rounded-lg border border-border/40 overflow-hidden font-mono text-xs',
          'bg-muted/30',
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/20">
          <FileEdit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            diff: {filePath}
          </span>
        </div>

        {/* Diff lines */}
        <div className="overflow-x-auto">
          {visibleLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                'flex items-start px-3 py-0 leading-5 whitespace-pre',
                line.type === 'add' && 'bg-green-500/10 text-green-600',
                line.type === 'delete' && 'bg-red-500/10 text-red-600',
                line.type === 'context' && 'text-foreground/60',
              )}
            >
              {/* Line number gutter */}
              <span className="w-8 shrink-0 text-right pr-2 text-muted-foreground/50 select-none">
                {line.oldLineNo ?? ' '}
              </span>
              <span className="w-4 shrink-0 text-center select-none">
                {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
              </span>
              <span className="flex-1">{line.content}</span>
            </div>
          ))}
        </div>

        {/* Collapse toggle */}
        {shouldCollapse && !isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center justify-center gap-1 w-full px-3 py-1.5 text-xs text-primary hover:bg-muted/40 transition-colors"
          >
            <ChevronDown className="w-3 h-3" />
            展开 {hiddenCount} 行变更
          </button>
        )}
      </div>
    )
  },
)

DiffPreview.displayName = 'DiffPreview'

/**
 * Convenience: parse raw unified diff text into DiffLine[] and render.
 */
export function DiffPreviewFromText({
  filePath,
  diffText,
  collapseThreshold,
  className,
}: {
  filePath: string
  diffText: string
  collapseThreshold?: number
  className?: string
}) {
  const lines = useMemo(() => parseDiffText(diffText), [diffText])
  return (
    <DiffPreview
      filePath={filePath}
      lines={lines}
      collapseThreshold={collapseThreshold}
      className={className}
    />
  )
}

export default DiffPreview
