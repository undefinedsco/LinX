/**
 * ErrorBlock - 错误块渲染器
 * 
 * 参考 Cherry Studio: src/renderer/src/pages/home/Messages/Blocks/ErrorBlock.tsx
 * 显示消息处理过程中的错误信息
 */

import { memo } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ErrorMessageBlock } from '@linx/models'

interface ErrorBlockProps {
  block: ErrorMessageBlock
  /** 重试回调 */
  onRetry?: () => void
  className?: string
}

/**
 * 错误块组件
 * - 显示错误图标和消息
 * - 可选的重试按钮
 */
export const ErrorBlock = memo<ErrorBlockProps>(({
  block,
  onRetry,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg',
        'bg-destructive/10 border border-destructive/30',
        className
      )}
    >
      {/* Error Icon */}
      <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />

      {/* Error Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-destructive font-medium">
          {block.message}
        </p>
        
        {/* Error Details */}
        {block.error?.details != null && (
          <pre className="mt-2 text-xs text-destructive/80 overflow-x-auto">
            {typeof block.error.details === 'string'
              ? block.error.details
              : JSON.stringify(block.error.details as object, null, 2)}
          </pre>
        )}
      </div>

      {/* Retry Button */}
      {block.retryable && onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10"
          onClick={onRetry}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          重试
        </Button>
      )}
    </div>
  )
})

ErrorBlock.displayName = 'ErrorBlock'

export default ErrorBlock
