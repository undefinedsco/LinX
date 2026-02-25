/**
 * SessionInputbar - CLI session dedicated input bar
 *
 * Section 7.6: Injects commands into a running CLI session.
 * - Placeholder: "输入指令发送给 CLI session..."
 * - No @mention, no file attachments, no deep-thinking toggle
 * - Supports Ctrl+C to send interrupt signal
 *
 * CP0: contract types + skeleton UI, send callback is a no-op.
 */

import { memo, useRef, useEffect, useCallback, useState, type KeyboardEvent } from 'react'
import { Send, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// Types (contract)
// ============================================================================

export interface SessionInputbarProps {
  /** Current input value */
  value: string
  /** Input change callback */
  onChange: (value: string) => void
  /** Send command to CLI session */
  onSend: () => void
  /** Send interrupt signal (Ctrl+C) */
  onInterrupt?: () => void
  /** Whether the session is active (accepting input) */
  isSessionActive?: boolean
  /** Disabled state */
  disabled?: boolean
  className?: string
}

// ============================================================================
// Component
// ============================================================================

export const SessionInputbar = memo<SessionInputbarProps>(
  ({
    value,
    onChange,
    onSend,
    onInterrupt,
    isSessionActive = true,
    disabled,
    className,
  }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [isFocused, setIsFocused] = useState(false)

    // Auto-resize textarea
    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        const scrollHeight = textareaRef.current.scrollHeight
        textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`
      }
    }, [value])

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Ctrl+C → interrupt signal
        if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !value) {
          e.preventDefault()
          onInterrupt?.()
          return
        }

        // Enter → send (Shift+Enter for newline)
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          if (!disabled && value.trim()) {
            onSend()
          }
        }
      },
      [disabled, value, onSend, onInterrupt],
    )

    const isDisabled = disabled || !isSessionActive

    return (
      <div
        className={cn(
          'flex flex-col relative z-[2]',
          'px-5 pb-5 pt-0',
          className,
        )}
      >
        <div
          className={cn(
            'relative flex items-end gap-2',
            'border border-border/50 rounded-xl',
            'bg-background',
            'transition-all duration-200',
            isFocused && 'border-primary/50',
            isDisabled && 'opacity-50',
          )}
        >
          {/* CLI indicator */}
          <div className="flex items-center pl-3 pb-2.5 pt-2.5 shrink-0">
            <Terminal className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={
              isSessionActive
                ? '输入指令发送给 CLI session...'
                : 'Session 已结束'
            }
            disabled={isDisabled}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent',
              'py-2.5 pr-2',
              'text-sm leading-[1.4]',
              'placeholder:text-muted-foreground/50',
              'min-h-[36px]',
              'focus:outline-none',
              'disabled:cursor-not-allowed',
              '[&::-webkit-scrollbar]:w-[3px]',
              '[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20',
              '[&::-webkit-scrollbar-thumb]:rounded-full',
            )}
            style={{ maxHeight: '120px' }}
          />

          {/* Send button */}
          <div className="flex items-center pr-2 pb-1.5 shrink-0">
            <Button
              onClick={onSend}
              disabled={isDisabled || !value.trim()}
              size="icon"
              className="h-8 w-8 rounded-lg"
            >
              <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          </div>
        </div>

        {/* Hint */}
        {isSessionActive && (
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[11px] text-muted-foreground/50">
              Enter 发送 · Shift+Enter 换行 · Ctrl+C 中断
            </span>
          </div>
        )}
      </div>
    )
  },
)

SessionInputbar.displayName = 'SessionInputbar'

export default SessionInputbar
