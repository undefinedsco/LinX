/**
 * LinX 间距和尺寸系统
 * 
 * 基于 8px 基准的间距系统（8 Point Grid）
 * 所有间距都是 4px 的倍数，确保像素对齐
 * 
 * 优势：
 * 1. 统一的视觉节奏
 * 2. 更好的设计一致性
 * 3. 易于维护和扩展
 * 4. 符合 Material Design 和 iOS 设计规范
 */

/**
 * 间距系统
 * Tailwind 默认使用 4px 为基准单位
 */
export const spacing = {
  // 基础间距
  0: '0px',      // 无间距
  1: '4px',      // 最小间距
  2: '8px',      // 紧凑间距
  3: '12px',     // 标准小间距
  4: '16px',     // 标准间距 ⭐ 最常用
  5: '20px',     // 中等间距
  6: '24px',     // 较大间距
  8: '32px',     // 大间距
  10: '40px',    // 超大间距（图标尺寸）
  12: '48px',    // 区块间距
  16: '64px',    // 头部高度 ⭐
  
  // 特殊尺寸
  px: '1px',     // 边框
} as const

/**
 * 组件尺寸预设
 */
export const componentSizes = {
  // 图标尺寸
  icon: {
    xs: 'w-4 h-4',      // 16x16 - 小图标
    sm: 'w-5 h-5',      // 20x20 - 次要图标
    md: 'w-6 h-6',      // 24x24 - 标准图标
    lg: 'w-8 h-8',      // 32x32 - 聊天头像
    xl: 'w-10 h-10',    // 40x40 - 导航图标 ⭐
  },
  
  // 按钮尺寸
  button: {
    sm: 'h-8 px-3 text-sm',       // 小按钮
    md: 'h-10 px-4 text-base',    // 标准按钮
    lg: 'h-12 px-6 text-lg',      // 大按钮
    icon: 'w-10 h-10 p-0',        // 图标按钮
  },
  
  // 输入框尺寸
  input: {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-base',
    lg: 'h-12 px-6 text-lg',
  },
  
  // 头像尺寸
  avatar: {
    xs: 'w-6 h-6',      // 24x24 - 小头像
    sm: 'w-8 h-8',      // 32x32 - 次要头像
    md: 'w-10 h-10',    // 40x40 - 标准头像 ⭐
    lg: 'w-12 h-12',    // 48x48 - 大头像
    xl: 'w-16 h-16',    // 64x64 - 超大头像
  },
  
  // 布局区域高度
  layout: {
    header: 'h-16',     // 64px - 头部高度 ⭐
    footer: 'h-16',     // 64px - 底部高度
    listItem: 'h-[70px]', // 70px - 列表项高度 ⭐
  },
  
  // 面板宽度（用于 style prop）
  panel: {
    sidebar: { min: 64, default: 64, max: 240 },
    listPanel: { min: 180, default: 210, max: 400 },
  },
} as const

/**
 * 间距预设组合
 */
export const spacingPresets = {
  // 卡片内边距
  card: 'p-6',                    // 24px
  cardCompact: 'p-4',             // 16px
  
  // 列表项内边距
  listItem: 'px-3 py-2',          // 水平 12px，垂直 8px
  listItemLarge: 'px-6 py-4',     // 水平 24px，垂直 16px
  
  // 按钮内边距
  button: 'px-4 py-2',            // 水平 16px，垂直 8px
  buttonLarge: 'px-6 py-3',       // 水平 24px，垂直 12px
  
  // 输入框内边距
  input: 'px-4 py-3',             // 水平 16px，垂直 12px
  
  // 栈布局间距
  stack: {
    xs: 'gap-1',                  // 4px
    sm: 'gap-2',                  // 8px
    md: 'gap-4',                  // 16px ⭐
    lg: 'gap-6',                  // 24px
    xl: 'gap-8',                  // 32px
  },
  
  // 容器内边距
  container: {
    sm: 'p-4',                    // 16px
    md: 'p-6',                    // 24px ⭐
    lg: 'p-8',                    // 32px
  },
  
  // 页面边距
  page: 'px-6 py-4',              // 水平 24px，垂直 16px
} as const

/**
 * 圆角预设
 */
export const borderRadius = {
  none: 'rounded-none',           // 0px
  sm: 'rounded-sm',               // 2px
  md: 'rounded-md',               // 6px
  lg: 'rounded-lg',               // 8px ⭐ 小圆角
  xl: 'rounded-xl',               // 12px ⭐ 标准圆角
  '2xl': 'rounded-2xl',           // 16px - 大圆角
  '3xl': 'rounded-3xl',           // 24px
  full: 'rounded-full',           // 完全圆形
} as const

/**
 * 阴影预设
 */
export const shadows = {
  none: 'shadow-none',
  sm: 'shadow-sm',                // 轻微阴影
  md: 'shadow-md',                // 标准阴影
  lg: 'shadow-lg',                // 深阴影 ⭐
  xl: 'shadow-xl',                // 超深阴影
  '2xl': 'shadow-2xl',            // 玻璃态阴影
  
  // 带颜色的阴影（用于按钮高亮）
  primary: 'shadow-lg shadow-primary/30',  // 主色发光
  primarySubtle: 'shadow-md shadow-primary/20',
} as const

/**
 * 使用示例：
 * 
 * ```tsx
 * import { componentSizes, spacingPresets, borderRadius } from '@/theme/spacing'
 * 
 * // 方式 1：使用组件尺寸预设
 * function IconButton() {
 *   return (
 *     <button className={`${componentSizes.button.icon} ${borderRadius.xl}`}>
 *       <Icon className={componentSizes.icon.md} />
 *     </button>
 *   )
 * }
 * 
 * // 方式 2：使用间距预设
 * function Card({ children }) {
 *   return (
 *     <div className={`${spacingPresets.card} ${borderRadius.xl}`}>
 *       {children}
 *     </div>
 *   )
 * }
 * 
 * // 方式 3：直接使用 Tailwind 类名（推荐）
 * function ListItem() {
 *   return (
 *     <div className="h-[70px] px-3 py-2 rounded-xl gap-3 flex items-center">
 *       <div className="w-10 h-10 rounded-xl">头像</div>
 *       <div className="flex-1">内容</div>
 *     </div>
 *   )
 * }
 * 
 * // 方式 4：动态宽度（用于拖拽面板）
 * function Sidebar({ width = componentSizes.panel.sidebar.default }) {
 *   return (
 *     <div 
 *       className="flex flex-col"
 *       style={{ width: `${width}px`, minWidth: `${width}px` }}
 *     >
 *       侧边栏
 *     </div>
 *   )
 * }
 * ```
 * 
 * 设计原则：
 * 1. 优先使用 Tailwind 原生类名
 * 2. 复杂组合使用预设
 * 3. 动态值使用 componentSizes.panel 的数值
 * 4. 保持 4px 的间距倍数
 */

/**
 * LinX 布局特定尺寸
 */
export const linxLayout = {
  // 左侧导航栏
  sidebar: {
    minWidth: 60,       // 最小宽度（仅图标）
    defaultWidth: 60,   // 默认宽度
    maxWidth: 240,      // 最大宽度（展开显示标签）
    iconSize: 36,       // 图标尺寸 (w-9 h-9)
    avatarSize: 36,     // 头像尺寸 (w-9 h-9)
  },
  
  // 中间列表栏
  listPanel: {
    minWidth: 180,      // 最小宽度
    defaultWidth: 210,  // 默认宽度 (微信标准约 210px)
    maxWidth: 400,      // 最大宽度
    headerHeight: 64,   // 头部高度 (h-16)
    itemHeight: 64,     // 列表项高度 (h-16, 微信标准约 64px)
    avatarSize: 40,     // 列表项头像 (w-10 h-10)
  },
  
  // 右侧内容区
  contentArea: {
    minWidth: 400,      // 最小宽度（建议值）
    headerHeight: 64,   // 头部高度 (h-16)
    avatarSize: 32,     // 聊天头像 (w-8 h-8)
  },
  
  // 全局
  global: {
    headerHeight: 64,   // 统一头部高度
    borderRadius: 12,   // 统一圆角 (rounded-xl)
  },
} as const












