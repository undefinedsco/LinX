/**
 * LinX 主题颜色配置
 * 
 * 本文件定义了应用的颜色语义和使用场景
 * 实际颜色值通过 CSS 变量在 index.css 中定义
 * 
 * 优势：
 * 1. 只需修改 index.css 中的主色，整个应用颜色自动调整
 * 2. 支持深色/浅色模式切换
 * 3. 所有组件使用语义化颜色名称，而非硬编码颜色值
 */

export const themeColors = {
  /**
   * 主色 - Primary
   * 用途：主要交互元素、选中状态、强调内容
   * 示例：按钮、选中的导航项、链接
   */
  primary: {
    DEFAULT: 'bg-primary text-primary-foreground',
    hover: 'hover:bg-primary/90',
    active: 'active:bg-primary/80',
    subtle: 'bg-primary/10 text-primary',
    border: 'border-primary',
  },

  /**
   * 次要色 - Secondary
   * 用途：次要交互元素、辅助内容
   * 示例：次要按钮、标签
   */
  secondary: {
    DEFAULT: 'bg-secondary text-secondary-foreground',
    hover: 'hover:bg-secondary/80',
    subtle: 'bg-secondary/50',
  },

  /**
   * 静音色 - Muted
   * 用途：低优先级内容、占位符、禁用状态
   * 示例：次要文字、图标、分隔线
   */
  muted: {
    DEFAULT: 'bg-muted text-muted-foreground',
    text: 'text-muted-foreground',
    border: 'border-muted',
  },

  /**
   * 强调色 - Accent
   * 用途：高亮、悬停效果、通知
   * 示例：悬停背景、徽章、提示
   */
  accent: {
    DEFAULT: 'bg-accent text-accent-foreground',
    hover: 'hover:bg-accent hover:text-accent-foreground',
    subtle: 'bg-accent/10',
  },

  /**
   * 破坏性操作 - Destructive
   * 用途：危险操作、错误状态、警告
   * 示例：删除按钮、错误提示
   */
  destructive: {
    DEFAULT: 'bg-destructive text-destructive-foreground',
    hover: 'hover:bg-destructive/90',
    subtle: 'bg-destructive/10 text-destructive',
  },

  /**
   * 背景色 - Background
   * 用途：页面背景、容器背景
   */
  background: 'bg-background text-foreground',

  /**
   * 卡片/面板 - Card
   * 用途：卡片、面板、弹出层
   */
  card: {
    DEFAULT: 'bg-card text-card-foreground',
    hover: 'hover:bg-card/80',
  },

  /**
   * 边框 - Border
   * 用途：分隔线、边框
   */
  border: 'border-border',

  /**
   * 焦点环 - Ring
   * 用途：键盘焦点指示器
   */
  ring: 'focus-visible:ring-ring',
} as const

/**
 * 常用组合类名
 */
export const themePresets = {
  // 导航按钮（未选中）
  navButton: 'text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors',
  
  // 导航按钮（选中）
  navButtonActive: 'bg-primary text-primary-foreground shadow-lg',
  
  // 输入框
  input: 'bg-background border-input focus-visible:ring-1 focus-visible:ring-ring',
  
  // 卡片
  card: 'bg-card text-card-foreground border-border rounded-lg',
  
  // 列表项（悬停）
  listItemHover: 'hover:bg-accent/5 transition-colors',
  
  // 列表项（选中）
  listItemActive: 'bg-primary/10 border-l-2 border-l-primary',
} as const

/**
 * 使用示例：
 * 
 * ```tsx
 * import { themeColors, themePresets } from '@/theme/colors'
 * 
 * // 方式 1：使用预设组合
 * <button className={themePresets.navButton}>
 *   导航
 * </button>
 * 
 * // 方式 2：使用颜色配置
 * <div className={`${themeColors.primary.DEFAULT} rounded-lg p-4`}>
 *   主色卡片
 * </div>
 * 
 * // 方式 3：直接使用 Tailwind 语义类名
 * <button className="bg-primary text-primary-foreground hover:bg-primary/90">
 *   按钮
 * </button>
 * ```
 */












