/**
 * SessionControlBar - CLI Session control bar
 *
 * Section 7.3: Displays session metadata and action buttons at the top of
 * the content pane when viewing a CLI session chat.
 *
 * Status → button mapping (section 7.3):
 *   active    → Pause, Stop, Copy Log
 *   paused    → Resume, Stop, Copy Log
 *   completed → Copy Log
 *   error     → Copy Log
 *
 * CP0: contract types + skeleton UI.
 * CP1: functional button states, status indicator animations, callback wiring.
 */

import { memo, useCallback } from 'react'
import {
  Pause,
  Play,
  Square,
  ClipboardCopy,
  Terminal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// Types (contract)
// ============================================================================

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error'

export interface SessionControlBarProps {
  /** Session title */
  title: string
  /** Current session status */
  status: SessionStatus
  /** CLI tool name (e.g. "Claude Code", "Cursor") */
  tool: string
  /** Token usage so far */
  tokenUsage: number
  /** Formatted duration string */
  duration: string
  /** Auto-approved command patterns for this session */
  autoApprovedPatterns?: string[]
  /** Callbacks */
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
  onCopyLog?: () => void
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; dotClass: string }
> = {
  active: { label: '运行中', dotClass: 'bg-green-500 animate-pulse' },
  paused: { label: '已暂停', dotClass: 'bg-amber-500' },
  completed: { label: '已完成', dotClass: 'bg-muted-foreground' },
  error: { label: '出错', dotClass: 'bg-red-500' },
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ============================================================================
// Component
// ============================================================================

export const SessionControlBar = memo<SessionControlBarProps>(
  ({
    title,
    status,
    tool,
    tokenUsage,
    duration,
    autoApprovedPatterns,
    onPause,
    onResume,
    onStop,
    onCopyLog,
    className,
  }) => {
    const cfg = STATUS_CONFIG[status]
    const isTerminal = status === 'completed' || status === 'error'

    const handlePause = useCallback(() => onPause?.(), [onPause])
    const handleResume = useCallback(() => onResume?.(), [onResume])
    const handleStop = useCallback(() => onStop?.(), [onStop])
    const handleCopyLog = useCallback(() => onCopyLog?.(), [onCopyLog])

    return (
      <div
        className={cn('border-b border-border/50 bg-muted/20', className)}
        role="toolbar"
        aria-label={`Session: ${title} — ${cfg.label}`}
      >
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          {/* Status dot + badge + title */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dotClass)}
              aria-hidden="true"
            />
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
              status === 'active' && 'bg-green-500/10 text-green-600',
              status === 'paused' && 'bg-amber-500/10 text-amber-600',
              status === 'completed' && 'bg-muted text-muted-foreground',
              status === 'error' && 'bg-red-500/10 text-red-600',
            )}>
              {cfg.label}
            </span>
            <span className="text-sm font-medium text-foreground truncate">{title}</span>
          </div>

          {/* Meta chips */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span className="flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5" />
              {tool}
            </span>
            <span>{formatTokens(tokenUsage)} tokens</span>
            <span>{duration}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Session actions">
            {status === 'active' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!onPause}
                onClick={handlePause}
                aria-label="暂停"
                title="暂停"
              >
                <Pause className="w-4 h-4" />
              </Button>
            )}

            {status === 'paused' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!onResume}
                onClick={handleResume}
                aria-label="恢复"
                title="恢复"
              >
                <Play className="w-4 h-4" />
              </Button>
            )}

            {!isTerminal && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                disabled={!onStop}
                onClick={handleStop}
                aria-label="停止"
                title="停止"
              >
                <Square className="w-4 h-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!onCopyLog}
              onClick={handleCopyLog}
              aria-label="复制日志"
              title="复制日志"
            >
              <ClipboardCopy className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Auto-approved patterns (if any) */}
        {autoApprovedPatterns && autoApprovedPatterns.length > 0 && (
          <div className="px-4 pb-2 text-[11px] text-muted-foreground/70">
            已自动允许: {autoApprovedPatterns.join(', ')}
          </div>
        )}
      </div>
    )
  },
)

SessionControlBar.displayName = 'SessionControlBar'

export default SessionControlBar
