/**
 * InputbarTools - 输入栏工具按钮组
 * 对齐 Cherry Studio + Lobe Chat 样式
 * 
 * Cherry Studio: InputbarTools 可拖拽排序，带图标和tooltip
 * Lobe Chat: ActionBar 分组折叠，支持 primary/text/normal 变体
 */
import { forwardRef, ReactNode } from 'react'
import { 
  Image as ImageIcon, 
  Paperclip, 
  Brain, 
  Globe, 
  Mic,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ============================================
// Types
// ============================================

export interface ToolItem {
  id: string
  icon: LucideIcon
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}

export interface ToolGroup {
  id: string
  items: ToolItem[]
  separator?: boolean
}

export interface InputbarToolsProps {
  /** 工具组配置 */
  groups?: ToolGroup[]
  /** 自定义左侧工具 */
  leftSlot?: ReactNode
  /** 自定义右侧工具 */
  rightSlot?: ReactNode
  /** 工具按钮变体 */
  variant?: 'default' | 'ghost' | 'outline'
  /** 工具按钮大小: 对齐 Cherry 26px */
  size?: 'sm' | 'default'
  /** 是否禁用所有工具 */
  disabled?: boolean
  /** 额外的样式类 */
  className?: string
  // 事件回调
  onImageClick?: () => void
  onFileClick?: () => void
  onDeepThinkingClick?: () => void
  onWebSearchClick?: () => void
  onVoiceClick?: () => void
  // 状态
  deepThinkingActive?: boolean
  webSearchActive?: boolean
}

// ============================================
// Tool Button Component
// ============================================

interface ToolButtonProps {
  icon: LucideIcon
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'default'
  onClick?: () => void
}

const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(
  ({ icon: Icon, label, shortcut, active, disabled, variant = 'ghost', size = 'default', onClick }, ref) => {
    // Cherry Studio: button 26px×26px, icon 15px
    const sizeClasses = size === 'sm' 
      ? 'h-[26px] w-[26px]' 
      : 'h-8 w-8'
    const iconClasses = size === 'sm' 
      ? 'w-[15px] h-[15px]' 
      : 'w-5 h-5'

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            variant={variant}
            size="icon"
            disabled={disabled}
            onClick={onClick}
            className={cn(
              sizeClasses,
              'text-muted-foreground hover:text-foreground',
              'rounded-lg transition-colors',
              active && 'text-primary bg-primary/10 hover:bg-primary/15'
            )}
          >
            <Icon className={iconClasses} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <span>{label}</span>
          {shortcut && (
            <span className="ml-2 text-muted-foreground">{shortcut}</span>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }
)
ToolButton.displayName = 'ToolButton'

// ============================================
// Separator Component
// ============================================

function ToolSeparator({ className }: { className?: string }) {
  return (
    <div className={cn('w-px h-4 bg-border mx-1', className)} />
  )
}

// ============================================
// Main Component
// ============================================

export function InputbarTools({
  groups,
  leftSlot,
  rightSlot,
  variant = 'ghost',
  size = 'default',
  disabled,
  className,
  onImageClick,
  onFileClick,
  onDeepThinkingClick,
  onWebSearchClick,
  onVoiceClick,
  deepThinkingActive,
  webSearchActive,
}: InputbarToolsProps) {
  // 默认工具组：对齐 Cherry Studio 和 Lobe Chat
  const defaultGroups: ToolGroup[] = groups ?? [
    {
      id: 'media',
      items: [
        { id: 'image', icon: ImageIcon, label: '图片', onClick: onImageClick },
        { id: 'file', icon: Paperclip, label: '文件', onClick: onFileClick },
      ],
    },
    {
      id: 'ai',
      separator: true,
      items: [
        { 
          id: 'deep-thinking', 
          icon: Brain, 
          label: '深度思考', 
          active: deepThinkingActive,
          onClick: onDeepThinkingClick 
        },
        { 
          id: 'web-search', 
          icon: Globe, 
          label: '联网搜索', 
          active: webSearchActive,
          onClick: onWebSearchClick 
        },
      ],
    },
  ]

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Left Slot */}
      {leftSlot}

      {/* Tool Groups */}
      {defaultGroups.map((group, groupIdx) => (
        <div key={group.id} className="flex items-center gap-1">
          {/* Separator before group (except first) */}
          {group.separator && groupIdx > 0 && <ToolSeparator />}
          
          {/* Group Items */}
          {group.items.map((item) => (
            <ToolButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              shortcut={item.shortcut}
              active={item.active}
              disabled={disabled || item.disabled}
              variant={variant}
              size={size}
              onClick={item.onClick}
            />
          ))}
        </div>
      ))}

      {/* Voice Button (optional, Lobe Chat style) */}
      {onVoiceClick && (
        <>
          <ToolSeparator />
          <ToolButton
            icon={Mic}
            label="语音输入"
            disabled={disabled}
            variant={variant}
            size={size}
            onClick={onVoiceClick}
          />
        </>
      )}

      {/* Right Slot */}
      {rightSlot}
    </div>
  )
}

// ============================================
// Presets - 预设工具配置
// ============================================

/** Cherry Studio 默认工具配置 */
export const CHERRY_DEFAULT_TOOLS: ToolGroup[] = [
  {
    id: 'media',
    items: [
      { id: 'image', icon: ImageIcon, label: '图片' },
      { id: 'file', icon: Paperclip, label: '文件' },
    ],
  },
  {
    id: 'ai',
    separator: true,
    items: [
      { id: 'deep-thinking', icon: Brain, label: '深度思考' },
      { id: 'web-search', icon: Globe, label: '联网搜索' },
    ],
  },
]

/** Lobe Chat 默认工具配置 (更丰富) */
export const LOBE_DEFAULT_TOOLS: ToolGroup[] = [
  {
    id: 'media',
    items: [
      { id: 'image', icon: ImageIcon, label: '上传图片' },
      { id: 'file', icon: Paperclip, label: '上传文件' },
    ],
  },
  {
    id: 'enhance',
    separator: true,
    items: [
      { id: 'enhance', icon: Sparkles, label: '增强提示词' },
    ],
  },
  {
    id: 'ai',
    separator: true,
    items: [
      { id: 'deep-thinking', icon: Brain, label: '深度思考' },
      { id: 'web-search', icon: Globe, label: '联网搜索' },
    ],
  },
]

export default InputbarTools
