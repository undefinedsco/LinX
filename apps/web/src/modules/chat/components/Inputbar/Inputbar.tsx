/**
 * Inputbar - AI 聊天输入栏
 * 
 * 像素级对齐 Cherry Studio:
 * - Container: padding 0 18px 18px 18px
 * - InputBarContainer: border-radius 17px, padding-top 8px, border 0.5px solid
 * - Textarea: padding 6px 15px 0, line-height 1.4, min-height 30px
 * - BottomBar: height 40px, padding 5px 8px, gap 16px
 * - LeftSection: flex 1
 * - RightSection: gap 6px
 * - DragHandle: height 6px, opacity 0 -> 1 on hover
 * 
 * 结合 Lobe Chat:
 * - FilePreview 区域
 * - 拖拽上传
 */
import { 
  useRef, 
  useEffect, 
  useState,
  useCallback,
  KeyboardEvent, 
  ReactNode,
  DragEvent,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { Send, Square, Loader2, GripHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { InputbarTools, InputbarToolsProps } from './InputbarTools'

// ============================================
// Types
// ============================================

export interface InputbarFile {
  id: string
  file: File
  preview?: string
  uploading?: boolean
  error?: string
}

export interface InputbarProps {
  /** 输入值 */
  value: string
  /** 输入变化回调 */
  onChange: (value: string) => void
  /** 发送回调 */
  onSend: () => void
  /** 停止生成回调 */
  onStop?: () => void
  /** 是否禁用 */
  disabled?: boolean
  /** 是否正在生成 */
  isGenerating?: boolean
  /** 占位文本 */
  placeholder?: string
  /** 最大高度 */
  maxHeight?: number
  /** 工具栏配置 */
  toolsProps?: InputbarToolsProps
  /** 文件列表 */
  files?: InputbarFile[]
  /** 文件上传回调 */
  onFilesChange?: (files: InputbarFile[]) => void
  /** 自定义发送按钮 */
  sendButton?: ReactNode
  /** 工具栏左侧插槽 */
  toolbarLeft?: ReactNode
  /** 工具栏右侧插槽 */
  toolbarRight?: ReactNode
  /** Token 计数 */
  tokenCount?: number
  /** 最大 Token */
  maxTokens?: number
  /** 是否显示 Token 计数 */
  showTokenCount?: boolean
  /** 自定义类名 */
  className?: string
  /** 变体: 对齐 Lobe Chat */
  variant?: 'default' | 'minimal'
}

export interface InputbarRef {
  focus: () => void
  blur: () => void
  clear: () => void
}

// ============================================
// File Preview Component
// ============================================

interface FilePreviewProps {
  files: InputbarFile[]
  onRemove: (id: string) => void
}

function FilePreview({ files, onRemove }: FilePreviewProps) {
  if (files.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 px-[15px] py-2 border-b border-border/30">
      {files.map((file) => (
        <div
          key={file.id}
          className={cn(
            'relative group flex items-center gap-2 px-2 py-1',
            'bg-muted/50 rounded-lg text-xs',
            file.error && 'border border-destructive'
          )}
        >
          {/* Preview Image */}
          {file.preview && (
            <img
              src={file.preview}
              alt={file.file.name}
              className="w-8 h-8 object-cover rounded"
            />
          )}
          
          {/* File Name */}
          <span className="max-w-[120px] truncate">{file.file.name}</span>
          
          {/* Upload Status */}
          {file.uploading && (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          )}
          
          {/* Remove Button */}
          <button
            onClick={() => onRemove(file.id)}
            className={cn(
              'absolute -top-1 -right-1 w-4 h-4',
              'bg-muted rounded-full',
              'flex items-center justify-center',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'text-muted-foreground hover:text-foreground'
            )}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Token Count Component
// ============================================

interface TokenCountProps {
  count: number
  max?: number
  className?: string
}

function TokenCount({ count, max, className }: TokenCountProps) {
  const isWarning = max && count > max * 0.8
  const isError = max && count > max

  return (
    <div 
      className={cn(
        'text-xs text-muted-foreground',
        isWarning && 'text-amber-500',
        isError && 'text-destructive',
        className
      )}
    >
      {count.toLocaleString()}
      {max && <span className="text-muted-foreground/50"> / {max.toLocaleString()}</span>}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export const Inputbar = forwardRef<InputbarRef, InputbarProps>(
  (
    {
      value,
      onChange,
      onSend,
      onStop,
      disabled,
      isGenerating,
      placeholder = '输入消息...',
      maxHeight = 200,
      toolsProps,
      files = [],
      onFilesChange,
      sendButton,
      toolbarLeft,
      toolbarRight,
      tokenCount,
      maxTokens,
      showTokenCount,
      className,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [customHeight, setCustomHeight] = useState<number | undefined>(undefined)
    const [isDragResizing, setIsDragResizing] = useState(false)

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      blur: () => textareaRef.current?.blur(),
      clear: () => onChange(''),
    }))

    // Auto-resize textarea
    useEffect(() => {
      if (textareaRef.current && !customHeight) {
        textareaRef.current.style.height = 'auto'
        const scrollHeight = textareaRef.current.scrollHeight
        textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
      }
    }, [value, maxHeight, customHeight])

    // Handle keyboard
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!disabled && !isGenerating && value.trim()) {
          onSend()
        }
      }
    }, [disabled, isGenerating, value, onSend])

    // Handle drag events for file upload
    const handleDragOver = useCallback((e: DragEvent) => {
      e.preventDefault()
      setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
    }, [])

    const handleDrop = useCallback((e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      
      if (!onFilesChange) return
      
      const droppedFiles = Array.from(e.dataTransfer.files)
      const newFiles: InputbarFile[] = droppedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: file.type.startsWith('image/') 
          ? URL.createObjectURL(file) 
          : undefined,
      }))
      
      onFilesChange([...files, ...newFiles])
    }, [files, onFilesChange])

    const handleRemoveFile = useCallback((id: string) => {
      if (!onFilesChange) return
      const file = files.find(f => f.id === id)
      if (file?.preview) {
        URL.revokeObjectURL(file.preview)
      }
      onFilesChange(files.filter(f => f.id !== id))
    }, [files, onFilesChange])

    // Cherry Studio: Drag handle for resize
    const handleDragStart = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startHeight = textareaRef.current?.offsetHeight || 60
      setIsDragResizing(true)

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = startY - moveEvent.clientY
        const newHeight = Math.max(30, Math.min(500, startHeight + deltaY))
        setCustomHeight(newHeight)
      }

      const handleMouseUp = () => {
        setIsDragResizing(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }, [])

    // Send button content
    const renderSendButton = () => {
      if (sendButton) return sendButton

      if (isGenerating) {
        return (
          <Button
            onClick={onStop}
            variant="secondary"
            size="icon"
            className="h-9 w-9 rounded-lg bg-red-500 hover:bg-red-600 text-white"
          >
            <Square className="w-4 h-4" />
          </Button>
        )
      }

      return (
        <Button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          size="icon"
          className="h-9 w-9 rounded-lg"
        >
          <Send className="w-4 h-4" />
        </Button>
      )
    }

    return (
      <div
        ref={containerRef}
        className={cn(
          // Cherry Studio Container: padding 0 18px 18px 18px
          'flex flex-col relative z-[2]',
          'px-[18px] pb-[18px] pt-0',
          isDragging && 'ring-2 ring-primary ring-inset',
          className
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* InputBarContainer - Cherry Studio: border-radius 17px */}
        <div 
          className={cn(
            'inputbar-container relative flex flex-col',
            // Cherry Studio: border 0.5px solid, border-radius 17px, padding-top 8px
            'border border-border/50 rounded-[17px] pt-2',
            // Cherry Studio: background-color with opacity
            'bg-background/70 backdrop-blur-sm',
            // 过渡动画
            'transition-all duration-200',
            // 拖拽文件状态
            isDragging && 'border-2 border-dashed border-green-500',
          )}
        >
          {/* DragHandle - Cherry Studio: height 6px, opacity 0 -> 1 */}
          <div 
            onMouseDown={handleDragStart}
            className={cn(
              'absolute -top-[3px] left-0 right-0 h-[6px]',
              'flex items-center justify-center',
              'cursor-row-resize z-[1]',
              'opacity-0 hover:opacity-100 transition-opacity duration-200',
              isDragResizing && 'opacity-100'
            )}
          >
            <GripHorizontal className="w-4 h-3 text-muted-foreground rotate-90" />
          </div>

          {/* File Preview (Lobe Chat style) */}
          {files.length > 0 && (
            <FilePreview files={files} onRemove={handleRemoveFile} />
          )}

          {/* Textarea Area - Cherry Studio: padding 6px 15px 0 */}
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={2}
              className={cn(
                'w-full resize-none bg-transparent',
                // Cherry Studio: padding 6px 15px 0, line-height 1.4
                'px-[15px] py-[6px] pb-0',
                'text-[15px] leading-[1.4]',
                'placeholder:text-muted-foreground/50',
                // Cherry Studio: min-height 30px
                'min-h-[30px]',
                'focus:outline-none',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                // 自定义滚动条
                '[&::-webkit-scrollbar]:w-[3px]',
                '[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20',
                '[&::-webkit-scrollbar-thumb]:rounded-full',
              )}
              style={{ 
                maxHeight: `${maxHeight}px`,
                height: customHeight ? `${customHeight}px` : 'auto',
              }}
            />
          </div>

          {/* BottomBar - Cherry Studio: height 40px, padding 5px 8px */}
          <div className="h-[40px] px-2 py-[5px] flex items-center justify-between gap-4 shrink-0 relative z-[2]">
            {/* LeftSection - Cherry Studio: flex 1 */}
            <div className="flex items-center flex-1 min-w-0 gap-4">
              {toolbarLeft}
              <InputbarTools 
                disabled={disabled}
                {...toolsProps} 
              />
            </div>

            {/* RightSection - Cherry Studio: gap 6px */}
            <div className="flex items-center gap-[6px]">
              {showTokenCount && tokenCount !== undefined && (
                <TokenCount count={tokenCount} max={maxTokens} />
              )}
              {toolbarRight}
              {renderSendButton()}
            </div>
          </div>
        </div>

        {/* Drag Overlay for file upload */}
        {isDragging && (
          <div className="absolute inset-0 bg-green-500/5 flex items-center justify-center pointer-events-none rounded-[17px] m-[18px] mb-[18px]">
            <div className="text-sm text-green-600 dark:text-green-400 font-medium">
              拖拽文件到这里上传
            </div>
          </div>
        )}
      </div>
    )
  }
)

Inputbar.displayName = 'Inputbar'

export default Inputbar
