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
 * CP1: proper unified diff parsing, dual-gutter line numbers, collapse/expand.
 */

import { memo, useState, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronUp, FileEdit } from 'lucide-react'
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

/**
 * Parse unified diff text into DiffLine[].
 *
 * Handles standard unified diff format:
 * - Skips `---`, `+++` file headers
 * - Parses `@@ -oldStart,oldCount +newStart,newCount @@` hunk headers
 * - Tracks old/new line numbers independently
 */
export function parseDiffText(raw: string): DiffLine[] {
  const result: DiffLine[] = []
  const lines = raw.split('\n')
  let oldLine = 1
  let newLine = 1

  for (const line of lines) {
    // Skip empty trailing line from split
    if (line === '' && lines.indexOf(line) === lines.length - 1) continue

    // Skip file headers
    if (line.startsWith('---') || line.startsWith('+++')) continue

    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10)
      newLine = parseInt(hunkMatch[2], 10)
      continue
    }

    // Skip other diff metadata (e.g. "diff --git", "index ...")
    if (line.startsWith('diff ') || line.startsWith('index ')) continue

    if (line.startsWith('+')) {
      result.push({ type: 'add', content: line.slice(1), newLineNo: newLine })
      newLine++
    } else if (line.startsWith('-')) {
      result.push({ type: 'delete', content: line.slice(1), oldLineNo: oldLine })
      oldLine++
    } else {
      // Context line (may start with space or be plain text)
      const content = line.startsWith(' ') ? line.slice(1) : line
      result.push({ type: 'context', content, oldLineNo: oldLine, newLineNo: newLine })
      oldLine++
      newLine++
    }
  }

  return result
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
    const addCount = useMemo(() => lines.filter((l) => l.type === 'add').length, [lines])
    const deleteCount = useMemo(() => lines.filter((l) => l.type === 'delete').length, [lines])

    const toggleExpand = useCallback(() => setIsExpanded((v) => !v), [])

    return (
      <div
        className={cn(
          'rounded-lg border border-border/40 overflow-hidden font-mono text-xs',
          'bg-muted/30',
          className,
        )}
        role="region"
        aria-label={`Diff: ${filePath}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/20">
          <FileEdit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate flex-1">
            {filePath}
          </span>
          <span className="text-[10px] text-green-600 shrink-0">+{addCount}</span>
          <span className="text-[10px] text-red-600 shrink-0">-{deleteCount}</span>
        </div>

        {/* Diff lines */}
        <div className="overflow-x-auto">
          {visibleLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                'flex items-start py-0 leading-5 whitespace-pre',
                line.type === 'add' && 'bg-green-500/10 text-green-600',
                line.type === 'delete' && 'bg-red-500/10 text-red-600',
                line.type === 'context' && 'text-foreground/60',
              )}
            >
              {/* Dual line number gutter: old | new */}
              <span className="w-8 shrink-0 text-right pr-1 text-muted-foreground/50 select-none border-r border-border/20">
                {line.oldLineNo ?? ' '}
              </span>
              <span className="w-8 shrink-0 text-right pr-1 text-muted-foreground/50 select-none">
                {line.newLineNo ?? ' '}
              </span>
              <span className="w-4 shrink-0 text-center select-none">
                {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
              </span>
              <span className="flex-1 pr-3">{line.content}</span>
            </div>
          ))}
        </div>

        {/* Collapse/expand toggle */}
        {shouldCollapse && (
          <button
            onClick={toggleExpand}
            className="flex items-center justify-center gap-1 w-full px-3 py-1.5 text-xs text-primary hover:bg-muted/40 transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                折叠
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                展开 {hiddenCount} 行变更
              </>
            )}
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
