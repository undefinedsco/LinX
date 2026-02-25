# UI Style Guide

## Design Philosophy

LinX 的设计理念是「温暖守护者」—— 作为用户的 AI 秘书，界面需要传达**可信赖、温暖、有陪伴感**的情感，而不是冰冷的工具感。

### v2 设计原则

1. **实色优先** - 使用实色背景而非半透明/玻璃态，更简洁、性能更好
2. **柔和阴影** - 使用自然的中性阴影，而非彩色阴影
3. **暖色点缀** - 紫色品牌色搭配琥珀/橙色暖色调
4. **大圆角** - 传达友好、无攻击性的感觉
5. **舒适间距** - 足够的留白带来呼吸感

## Color Palette

### Primary (Brand Purple)
- `#5B21B6` - Deep purple (--purple-deep)
- `#7C3AED` - Medium purple (--purple-medium, --primary)
- `#C084FC` - Light purple (--purple-light)

### Warm Accents (温暖点缀)
- `#F59E0B` - Amber (--warm-amber) - 用于成功、重要提示
- `#F97316` - Orange (--warm-orange) - 用于次要强调
- `#EAB308` - Yellow (--warm-yellow) - 用于警告
- `#FBF9F7` - Cream (--warm-cream) - 亮色模式下的暖白背景

### Success States
- `#22C55E` - Emerald (--success) - 标准成功色
- `#84CC16` - Lime (--success-warm) - 暖色成功色

### Neutrals
- `#09090b` - Darkest background (dark mode)
- `#18181b` - Card background (dark mode)
- `#27272a` - Muted areas (dark mode)
- `#3f3f46` - Borders (dark mode)

## Shadows

### 柔和阴影原则

使用中性黑色阴影而非彩色阴影，更自然、更通用：

```css
/* 小阴影 - 按钮、输入框 */
shadow-md shadow-black/5

/* 中阴影 - 卡片 */
shadow-lg shadow-black/5

/* 大阴影 - 弹窗、悬浮层 */
shadow-xl shadow-black/10
```

**避免使用：**
- `shadow-[0_20px_60px_-12px_rgba(124,58,237,0.2)]` - 紫色阴影过于强烈
- `backdrop-blur-md` - 玻璃态效果与"温暖"理念不符

## Border Radius

温暖感通过大圆角传达：

| 用途 | 圆角值 | Tailwind 类 |
|------|--------|-------------|
| 小按钮/标签 | 8px | `rounded-lg` |
| 输入框/中等组件 | 12px | `rounded-xl` |
| 卡片/弹窗 | 16-24px | `rounded-2xl` |
| 大型容器 | 28px | `rounded-3xl` |

## Typography

- Font family: Inter (or system sans fallback)
- Heading weight: 600
- Body weight: 400
- Line height: >= 1.5

## Motion

- Transitions: 200ms (比之前的 300ms 更快捷，但仍然柔和)
- Hover fades: 150-200ms
- Easing: `ease-out` 或默认
- Entry animations: `slide-in-from-top-2 + fade-in`

## Component Classes

### 温暖卡片
```css
.warm-card {
  @apply bg-card border border-border/50 rounded-2xl;
  @apply shadow-lg shadow-black/5;
  @apply transition-all duration-200;
}
```

### 温暖按钮
```css
.btn-warm {
  @apply rounded-2xl h-12 px-6;
  @apply bg-primary text-primary-foreground;
  @apply shadow-md shadow-primary/20;
  @apply transition-all duration-200;
  @apply hover:shadow-lg hover:-translate-y-0.5;
}
```

### 温暖输入框
```css
.input-warm {
  @apply rounded-xl border border-border/60 bg-muted/50;
  @apply transition-all duration-200;
  @apply focus:bg-background focus:border-primary/50;
}
```

### 顶部装饰条
```css
.top-accent {
  @apply absolute top-0 left-0 right-0 h-1 rounded-t-2xl;
  background: linear-gradient(90deg,
    hsl(var(--purple-medium)),
    hsl(var(--warm-amber))
  );
}
```

### 暖色徽章
```css
.badge-warm {
  @apply rounded-full px-3 py-1;
  @apply bg-amber-100 text-amber-700;
  @apply dark:bg-amber-900/30 dark:text-amber-400;
}
```

## Copy Guidelines

使用温暖、友好的文案：

| 避免 | 推荐 |
|------|------|
| 登录 | 欢迎回来 / 进入空间 |
| 切换账号 | 使用其他账号 |
| 正在连接 Pod... | 正在连接你的空间... |
| 取消登录 | 取消 |
| 错误 | 出了点小问题 |
| 成功 | 完成了！ |

## Migration from v1

### 已移除的元素
- `backdrop-blur-md` / `backdrop-blur-sm` - 玻璃态效果
- `bg-card/95` - 半透明背景
- `shadow-[...rgba(124,58,237,...)]` - 紫色阴影

### 替换映射
| v1 | v2 |
|----|-----|
| `bg-card/95 backdrop-blur-md` | `bg-card` |
| `shadow-[0_20px_60px_-12px_rgba(124,58,237,0.2)]` | `shadow-lg shadow-black/5` |
| `border-border/30` | `border-border/50` |

### 保留的元素
- 大圆角 (`rounded-2xl`, `rounded-3xl`)
- 紫色品牌色
- 平滑过渡动画
