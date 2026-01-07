/**
 * LinX 主题系统入口
 * 
 * 统一导出配色和间距系统
 */

// 配色系统
export { themeColors, themePresets } from './colors'

// 间距系统
export { 
  spacing, 
  componentSizes, 
  spacingPresets,
  borderRadius,
  shadows,
  linxLayout,
} from './spacing'

/**
 * 使用示例：
 * 
 * ```tsx
 * import { componentSizes, themePresets, linxLayout } from '@/theme'
 * 
 * function MyComponent() {
 *   return (
 *     <div className={themePresets.card}>
 *       <button className={componentSizes.button.md}>
 *         按钮
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */












