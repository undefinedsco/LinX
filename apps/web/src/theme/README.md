# LinX 主题系统

> 基于 Shadcn/ui + Tailwind CSS 的主题配置系统

## 🎨 设计理念

**一处定义，全局生效**

只需在 `src/index.css` 中修改主色（`--primary`），整个应用的配色会自动调整。所有颜色都基于语义化命名，而非硬编码的 hex 值。

## 📁 文件结构

```
src/
├── index.css              # 主题颜色定义（CSS 变量）
├── theme/
│   ├── colors.ts          # 颜色语义和使用场景说明
│   ├── spacing.ts         # 间距和尺寸系统
│   └── README.md          # 本文档
└── components/            # 使用语义化类名
```

## 🎯 系统组成

LinX 的主题系统包含两个核心部分：

1. **配色系统**（`colors.ts` + `index.css`）
   - 基于语义化的 CSS 变量
   - 一处修改，全局生效

2. **间距系统**（`spacing.ts`）
   - 基于 8px 基准的间距规范
   - 统一的尺寸和圆角定义

## 🎨 配色系统

### 1. **只需修改一个颜色**

在 `index.css` 中修改主色：

```css
:root {
  --primary: 258 90% 66%;  /* 紫色 #8b5cf6 */
}
```

整个应用的这些元素会自动更新：
- ✅ 选中的导航项
- ✅ 按钮背景
- ✅ 消息气泡
- ✅ 未读徽章
- ✅ 焦点指示器
- ✅ 所有使用主色的地方

### 2. **语义化命名**

❌ **旧方式**（硬编码）：
```tsx
<button className="bg-[#8b5cf6] text-white hover:bg-[#7c3aed]">
  按钮
</button>
```

✅ **新方式**（语义化）：
```tsx
<button className="bg-primary text-primary-foreground hover:bg-primary/90">
  按钮
</button>
```

### 3. **支持深色/浅色模式**

在 `index.css` 中同时定义了 `:root`（深色）和 `.light`（浅色）主题。
切换主题只需在根元素添加/移除 `.light` 类。

### 4. **类型安全（可选）**

通过 `theme/colors.ts` 提供了 TypeScript 类型定义和预设组合。

## 🛠️ 使用方法

### 方式 1：直接使用 Tailwind 类名（推荐）

```tsx
import { cn } from '@/lib/utils'

function MyComponent() {
  return (
    <div className={cn(
      'bg-primary text-primary-foreground',
      'hover:bg-primary/90',
      'rounded-lg p-4'
    )}>
      主色卡片
    </div>
  )
}
```

### 方式 2：使用预设组合

```tsx
import { themePresets } from '@/theme/colors'

function NavButton({ active, children }) {
  return (
    <button className={active ? themePresets.navButtonActive : themePresets.navButton}>
      {children}
    </button>
  )
}
```

### 方式 3：在组件中动态组合

```tsx
import { cn } from '@/lib/utils'

function ListItem({ selected, children }) {
  return (
    <div className={cn(
      'p-3 rounded-lg transition-colors',
      selected 
        ? 'bg-primary/10 border-l-2 border-l-primary' 
        : 'hover:bg-accent/5'
    )}>
      {children}
    </div>
  )
}
```

## 🎨 可用的语义颜色

| 颜色名称 | 用途 | 示例场景 |
|---------|------|---------|
| `primary` | 主色，用于主要交互元素 | 按钮、选中状态、链接 |
| `secondary` | 次要色，用于次要元素 | 次要按钮、标签 |
| `muted` | 静音色，用于低优先级内容 | 次要文字、图标、分隔线 |
| `accent` | 强调色，用于高亮 | 悬停背景、徽章、提示 |
| `destructive` | 破坏性操作 | 删除按钮、错误提示 |
| `background` | 页面背景 | 主背景色 |
| `card` | 卡片/面板 | 卡片背景 |
| `border` | 边框 | 分隔线 |

## 🔧 如何修改主题

### 修改主色

1. 访问：https://ui.shadcn.com/themes
2. 选择你喜欢的颜色
3. 复制生成的 CSS 变量
4. 粘贴到 `src/index.css` 的 `:root` 部分

或者手动修改：

```css
:root {
  /* 修改这个值即可改变主色 */
  --primary: 258 90% 66%;  /* 格式：色相 饱和度 亮度 */
  
  /* 其他颜色会自动协调 */
}
```

### 调整背景深度

```css
:root {
  --background: 223 47% 6%;   /* 越小越深 */
  --card: 224 40% 10%;        /* 比背景稍亮 */
}
```

### 添加自定义颜色

在 `tailwind.config.ts` 中添加：

```ts
theme: {
  extend: {
    colors: {
      // 自定义颜色
      success: {
        DEFAULT: 'hsl(142 76% 36%)',
        foreground: 'hsl(355 100% 97%)',
      }
    }
  }
}
```

## 📊 颜色格式说明

CSS 变量使用 HSL 格式（无括号和逗号）：

```css
--primary: 258 90% 66%;
/* 等同于：hsl(258, 90%, 66%) */
/* 即：色相258° 饱和度90% 亮度66% */
```

使用时 Tailwind 会自动添加 `hsl()`：

```tsx
className="bg-primary"
// 编译为：background-color: hsl(var(--primary))
```

## 🚀 最佳实践

### ✅ DO

- 使用语义化类名：`bg-primary` 而非 `bg-[#8b5cf6]`
- 使用 `cn()` 工具函数合并类名
- 使用 `/90`、`/10` 等透明度修饰符：`bg-primary/90`
- 在组件中使用条件类名

### ❌ DON'T

- 不要硬编码颜色值：`bg-[#8b5cf6]`
- 不要使用非语义化的颜色名：`bg-purple-500`（除非是特殊场景）
- 不要在多个地方定义相同的颜色组合

## 🔄 迁移现有组件

1. 找到硬编码的颜色：
   ```tsx
   // 旧
   className="bg-[#8b5cf6] text-white"
   ```

2. 替换为语义化类名：
   ```tsx
   // 新
   className="bg-primary text-primary-foreground"
   ```

3. 更新悬停状态：
   ```tsx
   // 旧
   className="hover:bg-[#7c3aed]"
   
   // 新
   className="hover:bg-primary/90"
   ```

## 📏 间距系统

### 基础概念

LinX 使用 **8px 基准间距系统**（8 Point Grid），所有间距都是 4px 的倍数。

### 常用间距值

| Tailwind | 实际值 | 使用场景 |
|----------|--------|---------|
| `1` | 4px | 最小间距 |
| `2` | 8px | 紧凑间距 |
| `3` | 12px | 标准小间距 |
| `4` | 16px | 标准间距 ⭐ |
| `6` | 24px | 较大间距 |
| `8` | 32px | 大间距 |
| `10` | 40px | 图标尺寸 ⭐ |
| `16` | 64px | 头部高度 ⭐ |

### 使用示例

```tsx
import { componentSizes, spacingPresets, linxLayout } from '@/theme/spacing'

// 1. 使用预设尺寸
<button className={componentSizes.button.md}>
  标准按钮
</button>

// 2. 使用间距预设
<div className={spacingPresets.card}>
  卡片内容
</div>

// 3. 直接使用 Tailwind 类名（推荐）
<div className="w-10 h-10 p-4 gap-3 rounded-xl">
  容器
</div>

// 4. 动态宽度（拖拽面板）
<div style={{ width: `${linxLayout.sidebar.defaultWidth}px` }}>
  侧边栏
</div>
```

### LinX 特定尺寸

```tsx
import { linxLayout } from '@/theme/spacing'

// 左侧导航栏
linxLayout.sidebar.defaultWidth  // 64px
linxLayout.sidebar.iconSize      // 40px (w-10 h-10)

// 中间列表栏
linxLayout.listPanel.defaultWidth // 210px
linxLayout.listPanel.itemHeight   // 70px

// 右侧内容区
linxLayout.contentArea.headerHeight // 64px
```

详细文档见 `theme/spacing.ts`

## 📚 参考资源

### 配色相关
- [Shadcn/ui 主题生成器](https://ui.shadcn.com/themes)
- [Tailwind CSS 颜色](https://tailwindcss.com/docs/customizing-colors)
- [HSL 颜色选择器](https://hslpicker.com/)

### 间距相关
- [Tailwind Spacing](https://tailwindcss.com/docs/customizing-spacing)
- [8-Point Grid System](https://spec.fm/specifics/8-pt-grid)
- [Material Design Layout](https://material.io/design/layout/spacing-methods.html)

---

**问题反馈**：如果在使用过程中遇到问题，请查看：
- `theme/colors.ts` - 配色使用示例
- `theme/spacing.ts` - 间距使用示例

