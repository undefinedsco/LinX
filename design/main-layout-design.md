# LinX 主布局设计文档

> 基于微信式三栏布局的 LinX 主界面设计
> 
> 创建时间：2025-11-06
> 状态：✅ 设计规范已确定

---

## 📋 目录

- [0. 产品定位](#0-产品定位)
- [1. 设计概述](#1-设计概述)
- [2. 设计规范](#2-设计规范)
- [3. 布局结构](#3-布局结构)
- [4. 功能定义](#4-功能定义)
- [5. 交互流程](#5-交互流程)
- [6. 技术实现](#6-技术实现)
- [7. 已确认的细节](#7-已确认的细节)

---

## 0. 产品定位

**完整的产品定位和核心功能描述请参考：**

👉 **[LinX 产品定位文档](./product-definition.md)**

**简要说明**：
- LinX = 可视化的 Solid Pod 终端
- AI 优先的交互方式
- Pod 作为用户与 AI 的共享记忆
- 六大核心功能：聊天、联系人、文件、收藏、密钥、设置

---

## 1. 设计概述

### 1.1 参考原型

参考微信桌面端的三栏式布局设计，适配 LinX 的核心功能场景。

### 1.2 设计目标

- ✅ 提供清晰的信息层级
- ✅ 支持高效的内容导航
- ✅ 保持 Solid Pod 数据的可见性
- ✅ 优雅的响应式体验
- ✅ 支持拖拽调整布局

---

## 2. 设计规范

### 2.1 尺寸规范

#### 左侧导航栏（Sidebar）
- **宽度**：`64px` 固定
- **头像尺寸**：`40×40px` 圆角
- **图标尺寸**：`40×40px`
- **图标间距**：垂直排列，间距待定

#### 中间列表栏（List Panel）
- **宽度**：`210px` 默认（可拖拽调整）
- **头部高度**：`64px`
- **列表项高度**：`70px`
- **最小宽度**：`180px`
- **最大宽度**：`400px`

#### 右侧内容区（Content Area）
- **宽度**：`flex-1` 自适应剩余空间
- **可拖拽调整**：支持
- **聊天框头部图标**：`32×32px`

#### 拖拽功能
- **左侧边界拖拽**：左侧导航栏与中间栏之间的分隔线可拖拽
  - 调整左侧导航栏宽度
  - 建议范围：`64px ~ 240px`（展开后可显示文字标签）
- **右侧边界拖拽**：中间栏与右侧内容区之间的分隔线可拖拽
  - 调整中间列表栏宽度
  - 范围：`180px ~ 400px`

#### 间距系统（Design Tokens）

**基于 Tailwind 的 Spacing Scale**

LinX 使用标准的 8px 基准间距系统（8 Point Grid），所有间距都是 4px 的倍数。

| Token | Tailwind | 实际值 | 使用场景 |
|-------|----------|--------|---------|
| `spacing-0` | `0` | 0px | 无间距 |
| `spacing-1` | `1` | 4px | 最小间距 |
| `spacing-2` | `2` | 8px | 紧凑间距 |
| `spacing-3` | `3` | 12px | 标准小间距 |
| `spacing-4` | `4` | 16px | 标准间距 ⭐ |
| `spacing-5` | `5` | 20px | 中等间距 |
| `spacing-6` | `6` | 24px | 较大间距 |
| `spacing-8` | `8` | 32px | 大间距 |
| `spacing-10` | `10` | 40px | 超大间距 |
| `spacing-12` | `12` | 48px | 区块间距 |
| `spacing-16` | `16` | 64px | 顶部高度 ⭐ |

**使用示例**：

```tsx
// 内边距
<div className="p-4">16px 内边距</div>
<div className="px-6 py-3">水平 24px，垂直 12px</div>

// 外边距
<div className="mb-4">底部 16px 外边距</div>
<div className="gap-3">子元素间距 12px</div>

// 宽高
<div className="w-10 h-10">40x40px 图标</div>
<div className="h-16">64px 高度头部</div>
```

**常用组合**：

| 场景 | 类名组合 | 说明 |
|------|---------|------|
| 图标按钮 | `w-10 h-10 p-2` | 40x40px 容器，内部留 8px |
| 列表项 | `px-3 py-2` | 水平 12px，垂直 8px |
| 卡片 | `p-6 gap-4` | 24px 内边距，子元素 16px 间距 |
| 头部区域 | `h-16 px-6` | 64px 高度，水平 24px |
| 小圆角 | `rounded-lg` | 12px 圆角 |
| 大圆角 | `rounded-xl` | 16px 圆角 |

**详细文档**：
- 👉 Tailwind Spacing: https://tailwindcss.com/docs/customizing-spacing
- 👉 查看 `apps/web/src/theme/spacing.ts` 获取完整定义

---

### 2.2 配色规范

#### Solid Protocol 官方配色方案 ⭐

**基于 Solid 社区品牌色的主题系统**

LinX 现在采用 Solid Protocol 官方配色方案，与 Solid Pod 生态保持一致的视觉品牌。所有颜色定义在 `apps/web/src/index.css` 中。

**核心理念**：
- ✅ 与 Solid Pod 生态品牌一致
- ✅ 基于官方 Royal Lavender (#7C4DFF) 主色
- ✅ 语义化命名，而非硬编码颜色值
- ✅ 支持深色/浅色模式切换
- ✅ 所有组件使用统一的颜色令牌

**Solid Protocol 官方配色**：
- 🟣 **主色**：`#7C4DFF` (Royal Lavender) - Solid 官方紫色
- 🔵 **辅助色**：`#083575` (Catalina Blue) - Solid 深蓝色
- 🩶 **中性色**：`#354866` (Header Blue) - 深蓝灰色
- 🩶 **文字色**：`#666666` (Body Grey) - 正文灰色

**深色主题配色定义**：

```css
:root {
  /* ======== Solid Protocol 官方配色深色适配 ======== */
  
  /* 背景层次 - 基于 Solid Catalina Blue (#083575) */
  --background: 215 45% 8%;         /* #0D1520 深蓝主背景 */
  --foreground: 215 15% 95%;        /* #F1F3F5 主要文字 */
  
  /* 卡片/面板 - 渐进式深蓝层次 */
  --card: 215 35% 11%;              /* #15202D 面板背景 */
  --card-foreground: 215 15% 95%;   /* #F1F3F5 面板文字 */
  
  /* 主色 - Solid 官方紫色 #7C4DFF */
  --primary: 258 100% 65%;          /* #7C4DFF Solid Royal Lavender */
  --primary-foreground: 0 0% 100%;  /* #FFFFFF 主色文字 */
  
  /* 次要色 - 基于 Solid 深蓝调整 */
  --secondary: 215 45% 20%;         /* #1E3A5F 深蓝次要色 */
  --secondary-foreground: 215 15% 85%; /* #D1D8E0 次要文字 */
  
  /* 静音色 - 柔和的深蓝灰 */
  --muted: 215 20% 18%;             /* #242B35 静音背景 */
  --muted-foreground: 215 10% 65%;  /* #9CA3AF 静音文字 */
  
  /* 强调色 - 与主色保持一致 */
  --accent: 258 100% 65%;           /* #7C4DFF 强调色 */
  --accent-foreground: 0 0% 100%;   /* #FFFFFF 强调文字 */
  
  /* 边框 - 柔和深蓝灰 */
  --border: 215 20% 22%;            /* #2D3748 边框色 */
  --input: 215 20% 22%;             /* #2D3748 输入框边框 */
  
  /* 焦点环 - Solid 紫色 */
  --ring: 258 100% 65%;             /* #7C4DFF 焦点环 */
}
```

**浅色主题配色定义**：

```css
.light {
  --background: 0 0% 100%;          /* #FFFFFF 白色背景 */
  --foreground: 215 45% 20%;        /* #354866 深蓝文字 (Solid Header Blue) */
  
  --card: 0 0% 98%;                 /* #FAFAFA 卡片背景 */
  --card-foreground: 215 45% 20%;   /* #354866 卡片文字 */
  
  --primary: 258 100% 65%;          /* #7C4DFF Solid 官方紫色 */
  --primary-foreground: 0 0% 100%;  /* #FFFFFF 主色文字 */
  
  --secondary: 215 45% 95%;         /* #F1F5F9 浅蓝次要色 */
  --secondary-foreground: 215 45% 20%; /* #354866 次要文字 */
  
  --muted: 215 45% 96%;             /* #F8FAFC 静音背景 */
  --muted-foreground: 0 0% 40%;     /* #666666 静音文字 (Solid Body Grey) */
  
  --accent: 258 100% 65%;           /* #7C4DFF 强调色 */
  --accent-foreground: 0 0% 100%;   /* #FFFFFF 强调文字 */
}
```

**使用方式**：

```tsx
// ❌ 旧方式（硬编码）
<button className="bg-[#7C4DFF] text-white">按钮</button>

// ✅ 新方式（语义化）
<button className="bg-primary text-primary-foreground">按钮</button>
```

**品牌色对应关系**：

| Solid 官方色 | 十六进制 | CSS 变量 | 用途 |
|-------------|---------|----------|------|
| Royal Lavender | `#7C4DFF` | `--primary` | 主要操作、品牌识别 |
| Catalina Blue | `#083575` | 背景层次基础色 | 深色背景渐变 |
| Header Blue | `#354866` | `--foreground` (浅色) | 主要文字、标题 |
| Body Grey | `#666666` | `--muted-foreground` (浅色) | 次要文字、描述 |

**详细文档**：
- 👉 Solid Protocol 品牌指南：https://solidproject.org/
- 👉 查看 `apps/web/src/index.css` 获取完整配色定义

---

#### 实际色值对照（供开发参考）

以下是 HSL 转换为 hex 的色值对照：

```css
/* Solid Protocol 主题 - 深色模式 */
--primary: #7C4DFF;           /* Solid 官方紫色 */

/* 背景色层次 - 基于 Catalina Blue */
--background: #0D1520;        /* 深蓝主背景 */
--card: #15202D;              /* 面板背景 */
--popover: #15202D;           /* 弹出层背景 */

/* 次要色 */
--secondary: #1E3A5F;         /* 深蓝次要色 */
--muted: #242B35;             /* 静音背景 */

/* 文字色 */
--foreground: #F1F3F5;        /* 主要文字 */
--muted-foreground: #9CA3AF;  /* 次要文字 */

/* 边框色 */
--border: #2D3748;            /* 边框色 */
--input: #2D3748;             /* 输入框边框 */

/* 功能色 */
--destructive: #F56565;       /* 错误红色 */
--ring: #7C4DFF;              /* 焦点环 */
```

#### 应用场景

| 元素 | Tailwind 类名 | 说明 |
|------|--------------|------|
| 左侧导航栏 | `bg-card border-r border-border/50` | 深蓝面板背景 + 边框 |
| 选中/激活状态 | `bg-primary text-primary-foreground shadow-lg shadow-primary/30` | Solid 紫色 + 发光 |
| 中间列表栏 | `bg-card border-r border-border/50` | 深蓝面板背景 |
| 列表项悬停 | `hover:bg-accent/5` | Solid 紫色轻微高亮 |
| 列表项选中 | `bg-primary/10 border-l-2 border-l-primary` | 紫色淡背景 + 左边框 |
| 右侧内容区 | `bg-background` | 深蓝主背景色 |
| 消息气泡（发送） | `bg-primary text-primary-foreground shadow-lg shadow-primary/20` | Solid 紫色消息 |
| 消息气泡（接收） | `bg-secondary text-secondary-foreground` | 深蓝色消息 |
| 主要按钮 | `bg-primary text-primary-foreground hover:bg-primary/90` | Solid 紫色按钮 |
| 次要按钮 | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | 深蓝色按钮 |
| 边框 | `border-border` | 统一深蓝灰边框 |
| 次要文字 | `text-muted-foreground` | 低优先级灰色文字 |

#### 玻璃态效果（可选装饰）

```css
/* 卡片/弹窗背景 - 使用主题变量 */
background: hsl(var(--card) / 0.65);
backdrop-filter: blur(16px);
box-shadow: 0 25px 65px hsl(var(--background) / 0.45);
border: 1px solid hsl(var(--border) / 0.2);
border-radius: var(--radius);
```

或使用 Tailwind 类名：

```tsx
className="bg-card/65 backdrop-blur-md shadow-2xl border border-border/20 rounded-lg"
```

### 2.3 字体规范

```css
/* 字体家族 */
font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;

/* 字号 */
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 30px;

/* 字重 */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;

/* 行高 */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

### 2.4 圆角规范

```css
--radius-sm: 8px;    /* 小圆角：按钮、输入框 */
--radius-md: 12px;   /* 中圆角：卡片 */
--radius-lg: 16px;   /* 大圆角：弹窗、面板 */
--radius-full: 50%;  /* 圆形：头像 */
```

### 2.5 阴影规范

```css
/* 轻微阴影 */
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.1);

/* 标准阴影 */
--shadow-md: 0 4px 16px rgba(0, 0, 0, 0.15);

/* 深阴影 */
--shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.2);

/* 超深阴影（玻璃态） */
--shadow-xl: 0 25px 65px rgba(15, 23, 42, 0.45);
```

### 2.6 动画规范

```css
/* 过渡时间 */
--transition-fast: 120ms;
--transition-base: 200ms;
--transition-slow: 300ms;

/* 缓动函数 */
--ease: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);

/* 使用示例 */
transition: all var(--transition-base) var(--ease);
```

---

## 3. 布局结构

### 3.1 整体布局

```
┌────────┬──────────────┬─────────────────────────────────┐
│        │              │                                 │
│  侧边栏  │   中间列表栏   │         主内容区                 │
│        │              │                                 │
│  64px  │  210px 可拖拽 │      flex-1 可拖拽               │
│        │              │                                 │
└────────┴──────────────┴─────────────────────────────────┘
```

**拖拽功能**：
- 左侧分隔线可拖拽：调整左侧导航栏宽度（64px - 240px）
- 右侧分隔线可拖拽：调整中间列表栏宽度（180px - 400px）

### 3.2 各区域详细设计

#### 左侧导航栏（Navigation Sidebar）

**尺寸**：固定宽度 `64px`

**内容**：
1. **顶部区域**（高度 64px）
   - 个人头像：`40×40px` 圆角
   - Solid Pod 状态指示器（右下角小圆点）
     - 🟢 绿色：已连接
     - 🟡 黄色：同步中
     - 🔴 红色：连接失败
   - 点击显示个人信息卡片

2. **导航图标区域**（垂直排列，从上到下）
   - 💬 **聊天** (Chat) - 默认首页，图标 `40×40px`
   - 👤 **联系人** (Contacts)，图标 `40×40px`
   - 📁 **文件** (Files)，图标 `40×40px`
   - 🔖 **收藏** (Favorites)，图标 `40×40px`
   - 🔑 **密钥** (Credentials)，图标 `40×40px`
   - 图标间距：垂直居中排列

3. **底部区域**
   - ⚙️ **设置** (Settings)，图标 `40×40px`
     - 包含隐藏的"模型供应商管理"入口

**视觉样式**：
- 背景色：`--bg-darkest` (#0F172A)
- 选中状态：紫色高光 (`--primary-purple` #7C3AED)
- 悬停效果：`opacity: 0.8` 过渡 200ms
- 图标颜色：未选中 `--text-muted`，选中 `--primary-purple`

---

#### 中间列表栏（List Panel）

**尺寸**：
- 默认宽度：`210px`
- 可拖拽调整：`180px ~ 400px`
- 头部高度：`64px`
- 列表项高度：`210px`（⚠️ 待确认：这个高度是否正确？通常列表项不会这么高）

**布局**：
```
┌─────────────────────────┐
│  搜索框       [+]        │ ← 顶部工具栏
├─────────────────────────┤
│  列表项 1                │
│  ├─ 头像                 │
│  ├─ 标题    时间         │
│  └─ 预览文本             │
├─────────────────────────┤
│  列表项 2                │
│  ...                    │
└─────────────────────────┘
```

**内容槽位**（根据左侧功能动态加载不同列表组件）：

| 左侧功能 | 中间栏组件 | 搜索提示 | [+] 按钮 |
|---------|-----------|---------|---------|
| 💬 聊天 | `<ConversationList />` | "搜索聊天" | 新建聊天 |
| 👤 联系人 | `<ContactList />` | "搜索联系人" | 添加联系人 |
| 📁 文件 | `<FileList />` | "搜索文件" | 上传文件 |
| 🔖 收藏 | `<FavoriteList />` | "搜索收藏" | 添加收藏 |
| 🔑 密钥 | `<CredentialList />` | "搜索密钥" | 添加密钥 |
| ⚙️ 设置 | `<SettingList />` | - | - |

**交互规则**：
- 搜索框：实时过滤当前列表
- [+] 按钮：根据当前功能添加新项目
- 列表项：点击后在右侧加载对应的详情组件
- 列表项高度：固定 `70px`

---

#### 右侧主内容区（Content Area）

**尺寸**：
- 宽度：`flex-1`，占据剩余空间（根据左侧和中间栏宽度自适应）
- 最小宽度：建议 `400px`（小于此宽度考虑响应式布局）

**布局框架**：
```
┌─────────────────────────────────────┐
│  [Header 区域 - 由子组件定义]         │
├─────────────────────────────────────┤
│                                     │
│                                     │
│  [Content 区域 - 动态加载组件]        │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  [Footer 区域 - 由子组件定义（可选）]  │
└─────────────────────────────────────┘
```

**说明**：
- 右侧区域是一个**容器**，具体内容由加载的组件决定
- 不同组件可能有不同的布局需求
- Header/Footer 是否显示由子组件控制

**内容槽位**（根据中间栏选中项动态加载不同组件）：

| 左侧选择 | 中间栏选择 | 右侧加载的组件 |
|---------|-----------|---------------|
| 💬 聊天 | 某个会话 | `<ChatInterface />` - 详见 [聊天界面设计](./chat-interface-design.md) |
| 👤 联系人 | 某个联系人 | `<ContactDetail />` - 联系人详情卡片 |
| 📁 文件 | 某个文件 | `<FilePreview />` - 文件预览组件 |
| 🔖 收藏 | 某个收藏 | `<FavoriteDetail />` - 收藏内容展示 |
| 🔑 密钥 | 某个密钥 | `<CredentialDetail />` - 密钥配置界面 |
| ⚙️ 设置 | 某个设置项 | `<SettingPanel />` - 设置详情页 |

**空状态**：
- 未选择任何项时，显示通用空状态提示

---

## 4. 功能定义

> 详细的功能说明请参考 [产品定位文档](./product-definition.md)

### 3.1 左侧边栏功能映射

**已确定**：LinX 的主要功能入口

优先级从高到低：

1. **💬 聊天 (Chat)** - 最高优先级，默认首页
   - 与 AI 助手对话是核心交互方式
   - 显示所有聊天会话（人类 + AI）

2. **👤 联系人 (Contacts)**
   - 管理自然人和 AI 联系人
   - 默认包含系统 AI 助手

3. **📁 文件 (Files)**
   - 本地终端文件管理
   - 与 Pod 同步

4. **🔖 收藏 (Favorites)**
   - Pod 内的收藏内容
   - 重要对话、文档、链接等

5. **🔑 密钥 (Credentials)**
   - 大模型 API 密钥管理
   - 安全存储

6. **⚙️ 设置 (Settings)** - 底部固定
   - 账户设置
   - Pod 连接管理
   - 模型供应商管理（高级设置，隐藏）

### 3.2 内容区组件映射

**已确定**：根据左侧选中的功能，加载不同的列表和详情组件

| 左侧功能 | 中间栏组件 | 右侧内容组件 | 组件设计文档 |
|---------|-----------|-------------|-------------|
| 💬 聊天 | `ConversationList` | `ChatInterface` | [聊天界面设计](./chat-interface-design.md) |
| 👤 联系人 | `ContactList` | `ContactDetail` | 联系人模块设计（待创建） |
| 📁 文件 | `FileList` | `FilePreview` | 文件模块设计（待创建） |
| 🔖 收藏 | `FavoriteList` | `FavoriteDetail` | 收藏模块设计（待创建） |
| 🔑 密钥 | `CredentialList` | `CredentialDetail` | 见 [安全文档](./security.md) |
| ⚙️ 设置 | `SettingList` | `SettingPanel` | 设置模块设计（待创建） |

### 3.3 核心交互流程

**已确定**：

1. **用户登录后看到什么？**
   - 默认进入 💬 **聊天** 视图
   - 中间栏显示聊天列表
   - 右侧自动打开与 **默认 AI 助手** 的对话
   - 显示欢迎消息："你好！我是你的 AI 助手，可以帮你管理 Pod 中的内容..."

2. **点击左侧图标**
   - 中间栏内容切换为对应列表
   - 右侧保持当前内容（除非没有选中项，则显示空状态）
   - URL 路由更新（如 `/chat`, `/contacts`）

3. **点击中间栏项目**
   - 右侧显示对应的详情或界面
   - 列表项高亮显示当前选中
   - 支持键盘上下键导航

4. **搜索功能**
   - 实时过滤当前中间栏列表
   - 支持拼音搜索（中文）
   - 搜索结果高亮关键词

---

## 5. 交互流程

### 4.1 登录流程

```
未登录
  ↓
WelcomePage (当前实现)
  ↓
Solid Pod 认证
  ↓
登录成功
  ↓
主布局界面（MainLayout）
  ├─ 左侧：聊天图标高亮
  ├─ 中间：聊天列表（默认 AI 助手在顶部）
  └─ 右侧：自动打开 AI 助手对话
        ↓
        AI 助手发送欢迎消息
```

**首次登录特殊处理**：
- 检测是否首次使用
- 如果是，AI 助手发送引导消息
  - "欢迎使用 LinX！"
  - "我可以帮你管理 Pod 中的数据，你可以问我..."
  - 提供快速操作提示

### 4.2 导航流程

**已确定**：

1. **左侧图标切换**
   ```
   点击图标
     ↓
   图标高亮状态切换
     ↓
   中间栏内容切换（加载对应列表）
     ↓
   右侧保持当前内容（或显示空状态）
     ↓
   更新 URL 路由
   ```

2. **中间列表加载**
   - 显示加载骨架屏
   - 从 Pod 或本地缓存加载数据
   - 支持下拉刷新
   - 支持无限滚动（虚拟列表优化）

3. **右侧详情展示**
   - 淡入动画（200ms）
   - 支持关闭按钮（移动端）
   - 支持 ESC 键关闭

4. **面包屑导航**
   - 不需要传统面包屑
   - 使用左侧高亮 + 中间选中项已经足够清晰

### 4.3 Solid Pod 集成

**已确定**：

1. **Pod 连接状态指示**
   - 左侧顶部头像右下角显示状态点
     - 🟢 绿色：已连接
     - 🟡 黄色：同步中
     - 🔴 红色：连接失败
   - 鼠标悬停显示详细信息（WebID、连接时间）

2. **WebID 显示**
   - 点击头像 → 弹出个人信息卡片
   - 显示完整 WebID
   - 显示 Pod 存储使用情况
   - 快速切换 Pod 按钮

3. **离线状态处理**
   - 自动切换到离线模式
   - 显示离线指示器
   - 允许查看缓存数据
   - AI 对话降级到本地模型（如果配置）

4. **数据同步**
   - 顶部显示细微的同步进度条
   - 同步完成后自动隐藏
   - 支持手动刷新按钮

5. **AI 与 Pod 的集成**
   - AI 对话时自动读取 Pod 中的相关数据
   - 在消息中显示"正在查询 Pod..."提示
   - 可以通过对话触发 Pod 操作
     - "帮我把这个文件收藏"
     - "查找我上周和张三的聊天记录"

---

## 6. 技术实现

### 6.1 组件结构

```
MainLayout
├── ResizablePanelGroup (水平布局)
│   ├── ResizablePanel (左侧导航栏)
│   │   └── Sidebar
│   │       ├── UserAvatar (Pod 连接状态)
│   │       └── NavigationIcons (6个功能图标)
│   ├── ResizableHandle (拖拽分隔线)
│   ├── ResizablePanel (中间列表栏)
│   │   └── ListPanel
│   │       ├── SearchBar (搜索框)
│   │       ├── ActionButton ([+] 按钮)
│   │       └── ItemList (动态列表内容)
│   ├── ResizableHandle (拖拽分隔线)
│   └── ResizablePanel (右侧内容区)
│       └── ContentArea
│           ├── ContentHeader (动态头部)
│           ├── ContentBody (动态内容)
│           └── ContentFooter (可选底部)
```

### 6.2 拖拽布局实现

**基于 shadcn/ui Resizable 组件**：

```tsx
import { 
  ResizablePanelGroup, 
  ResizablePanel, 
  ResizableHandle 
} from '@/components/ui/resizable'
import { linxLayout } from '@/theme/spacing'

export function MainLayout() {
  return (
    <div className="h-screen w-screen bg-background text-foreground overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        {/* 左侧导航栏 */}
        <ResizablePanel 
          defaultSize={5}   // 5% 默认宽度
          minSize={4}       // 4% 最小宽度  
          maxSize={15}      // 15% 最大宽度
          style={{ 
            minWidth: `${linxLayout.sidebar.minWidth}px`,      // 64px
            maxWidth: `${linxLayout.sidebar.maxWidth}px`       // 240px
          }}
        >
          <Sidebar 
            activeView={activeView}
            onViewChange={setActiveView}
          />
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        {/* 中间列表栏 */}
        <ResizablePanel 
          defaultSize={16}  // 16% 默认宽度
          minSize={12}      // 12% 最小宽度
          maxSize={25}      // 25% 最大宽度
          style={{ 
            minWidth: `${linxLayout.listPanel.minWidth}px`,    // 180px
            maxWidth: `${linxLayout.listPanel.maxWidth}px`     // 400px
          }}
        >
          <ListPanel
            activeView={activeView}
            selectedItem={selectedItem}
            onSelectItem={setSelectedItem}
          />
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        {/* 右侧内容区 */}
        <ResizablePanel 
          minSize={50}      // 50% 最小宽度
          style={{ 
            minWidth: `${linxLayout.contentArea.minWidth}px`   // 400px
          }}
        >
          <ContentArea
            activeView={activeView}
            selectedItem={selectedItem}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
```

**核心技术实现说明**：

1. **ResizablePanel 尺寸配置原理**：
   - `defaultSize/minSize/maxSize` 使用**百分比**进行响应式布局
   - `style.minWidth/maxWidth` 使用**像素值**确保符合设计规范
   - 两者结合保证既响应式又符合 LinX 设计系统

2. **百分比计算基于设计规范**：
   ```typescript
   // 基于 1440px 标准桌面宽度的百分比计算
   const STANDARD_WIDTH = 1440
   
   // 左侧导航栏：64px = 4.4%，240px = 16.7%
   defaultSize: 5,   // 5% 合适的默认值
   minSize: 4,       // 4% 对应 64px 最小值
   maxSize: 15,      // 15% 略小于 240px 最大值
   
   // 中间列表栏：180px = 12.5%，400px = 27.8%  
   defaultSize: 16,  // 16% 对应 230px 默认值
   minSize: 12,      // 12% 对应 180px 最小值
   maxSize: 25,      // 25% 对应 360px 合理最大值
   ```

3. **设计系统集成**：
   - 所有像素值来自 `@/theme/spacing.ts` 的 `linxLayout` 配置
   - 保持设计系统的一致性和可维护性
   - 支持主题切换和响应式调整

4. **状态管理**：
   - ResizablePanel 自动保存用户的布局偏好到 localStorage
   - 跨会话保持用户自定义的面板宽度
   - 支持重置到默认布局

**拖拽交互增强**：
- 左侧分隔线：调整 Sidebar 宽度（64px - 240px）
- 右侧分隔线：调整 ListPanel 宽度（180px - 400px）  
- 分隔线视觉：`withHandle` 显示 Solid 主题色的抓取手柄图标
- 拖拽时显示实时宽度提示（可选功能）

**响应式行为**：
- 小屏幕时自动折叠到最小宽度
- 超大屏幕时保持合理的最大宽度限制
- 保持内容可读性和操作便利性

### 5.2 路由设计

**已确定**：使用 TanStack Router 实现基于 URL 的路由

```
/                          → 重定向到 /chat
/chat                      → 聊天视图（默认选中 AI 助手）
/chat/:conversationId      → 打开指定聊天会话
/contacts                  → 联系人视图
/contacts/:contactId       → 打开指定联系人详情
/files                     → 文件视图
/files/:fileId             → 打开指定文件
/favorites                 → 收藏视图
/favorites/:favoriteId     → 打开指定收藏
/credentials               → 密钥管理视图
/credentials/:credentialId → 编辑指定密钥
/settings                  → 设置视图
/settings/providers        → 模型供应商管理（隐藏）
```

**路由守卫**：
- 所有路由需要登录验证
- 未登录自动跳转到 `/login` (WelcomePage)

### 5.3 状态管理

使用 TanStack Query + React Context 管理状态：

**全局状态**（Context）：
- `currentView` - 当前选中的功能视图
- `solidSession` - Solid Pod 会话信息
- `connectionStatus` - Pod 连接状态
- `defaultAIAssistant` - 默认 AI 助手信息

**本地状态**（Component State）：
- 中间栏：`selectedItemId`, `searchKeyword`, `listItems`
- 右侧内容：`contentData`, `isLoading`, `error`

**服务端状态**（TanStack Query）：
- 聊天列表、消息历史
- 联系人列表
- 文件列表
- 收藏列表
- API 密钥列表
- 所有数据自动缓存和失效管理

### 5.4 响应式设计

**已确定**：

1. **桌面端**（宽度 > 1024px）
   - 全三栏显示
   - 左侧固定 70px
   - 中间固定 280px
   - 右侧 flex-1

2. **平板**（768px - 1024px）
   - 左侧缩窄为 60px（仅图标）
   - 中间保持 280px
   - 右侧 flex-1
   - 点击左侧图标可展开侧边栏显示文字

3. **移动端**（< 768px）
   - 单栏显示，通过路由切换视图
   - 底部固定导航栏（5个主要图标）
   - 聊天视图：直接显示聊天界面，顶部返回按钮回到列表
   - 联系人视图：列表 → 详情，返回按钮
   - 其他视图：类似处理

**断点定义**：
```css
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
```

### 5.5 主题样式

- 保持现有的 Solid Pod 紫色主题 (`#5B21B6` → `#C084FC`)
- 深色玻璃态背景
- 与现有 shadcn/ui 组件风格一致

---

## 7. 已确认的细节

### 7.1 AI 助手相关 ✅

- [x] **Q1**: 默认 AI 助手使用哪个模型？
  - **答**：我们提供的模型

- [x] **Q2**: 用户可以创建多个 AI 联系人吗？
  - **答**：可以，用户可以创建多个 AI 联系人用于不同用途

- [x] **Q3**: AI 对话历史是否全部存储在 Pod 中？
  - **答**：是的，聊天记录存储在 Pod 中

- [x] **Q4**: AI 如何访问 Pod 数据？需要明确的权限机制吗？
  - **答**：一个 AI 作为一个应用，走 Solid 的鉴权机制

### 7.2 聊天功能细节 ✅

- [x] **Q5**: 是否支持群聊？
  - **答**：支持

- [x] **Q6**: 消息格式：纯文本？Markdown？富文本？
  - **答**：富文本

- [x] **Q7**: 文件在聊天中如何发送和显示？
  - **答**：支持在聊天中发送文件

- [x] **Q8**: 是否需要消息搜索功能？
  - **答**：有

### 7.3 数据存储策略 ✅

- [x] **Q9**: 聊天记录存储策略？
  - **答**：状态（state）存储在本地，数据存储在远端 Pod

- [x] **Q10**: 跨设备同步如何处理？
  - **答**：通过 Pod 实现跨设备同步（Pod 本身就是跨设备的）
  - **理解**：Pod 作为统一的数据源，所有设备都从 Pod 读写数据，自然实现同步

### 7.4 交互体验细节 ✅

- [x] **Q12**: 是否需要快捷键支持？
  - **答**：支持

- [x] **Q13**: 是否需要拖放功能？
  - **答**：支持（拖放文件到聊天等）

- [x] **Q14**: 通知机制？
  - **答**：支持（新消息提示、系统通知等）

### 7.5 UI 主题 ✅

- [x] **主题切换支持**
  - 支持深色/浅色主题切换
  - MVP 优先实现深色主题
  - 详细配色方案见 [主题设计文档](./theme-design.md)（待创建）

### 7.6 技术实现参考 ✅

- [x] **前端架构策略**
  - 详细的技术栈和组件库策略请参考：**[前端架构设计](./frontend-architecture.md)**
  - 本文档专注于主布局的设计规范和实现细节

---

## 8. 下一步行动

### 8.1 已完成 ✅
- [x] 创建产品定位文档
- [x] 明确 LinX 的核心定位（可视化 Pod 终端）
- [x] 确定三栏布局的具体内容
- [x] 确定设计规范（尺寸、配色、字体等）
- [x] 设计基本交互流程
- [x] 确认响应式策略
- [x] 规划路由结构
- [x] 确认核心功能细节

### 8.2 设计阶段（当前）
1. [x] 澄清所有布局相关问题 ✅
2. [x] 明确主布局职责（框架容器）✅
3. [ ] 设计左侧导航栏展开状态（64px → 240px）
4. [ ] 设计拖拽分隔线的交互和视觉反馈
5. [ ] 绘制主布局的线框图或原型
6. [ ] 设计详细的组件层级结构

**其他模块设计**（独立文档）：
- [ ] [聊天界面设计](./chat-interface-design.md)
- [ ] 联系人模块设计
- [ ] 文件模块设计
- [ ] 收藏模块设计
- [ ] 设置模块设计

### 8.3 实现阶段（准备就绪，可以开始）

**主布局实现**（基础框架）：
1. [x] 创建 MainLayout 基础组件（三栏结构）✅
2. [x] 实现左侧导航栏 ✅
    - Sidebar 组件（64px 固定宽度）
    - 导航图标和状态管理
3. [x] 实现拖拽分隔线（ResizeHandle 组件）✅
    - 左侧分隔线（不可拖拽，固定导航栏）
    - 右侧分隔线（调整列表栏 180-400px）
    - 保存用户偏好宽度到 localStorage
4. [x] 实现中间列表栏容器 ✅
    - ListPanel 组件（可变宽度）
    - 头部工具栏（搜索 + 按钮）
    - 列表容器（加载不同的 List 组件）
5. [x] 实现右侧内容区容器 ✅
    - ContentArea 组件（flex-1）
    - 统一头部设计
    - 动态加载子组件的路由逻辑
6. [x] 实现主题切换系统 ✅
    - Solid Protocol 官方配色 (#764FF6)
    - CSS 变量主题系统
7. [ ] 响应式布局适配
8. [ ] 性能优化和无障碍改进

**各模块组件实现**（具体技术方案见[前端架构设计](./frontend-architecture.md)）：
- [ ] ConversationList + ChatInterface
- [ ] ContactList + ContactDetail
- [ ] FileList + FilePreview
- [ ] FavoriteList + FavoriteDetail  
- [ ] CredentialList + CredentialDetail
- [ ] SettingList + SettingPanel

---

## 9. 参考资料

### 核心文档
- **[LinX 产品定位文档](./product-definition.md)** ⭐
- [微信桌面端界面截图](./prototypes/)

### 相关设计文档
- **[前端架构设计](./frontend-architecture.md)** ⭐ - 技术栈与组件库策略
- [主题设计文档](./theme-design.md)（待创建）
- [聊天界面设计](./chat-interface-design.md)（待创建）

### 技术文档
- [AI 集成方案](./ai-integration.md)（待创建 - 包含 Ollama、模型切换等）
- [安全和加密](./security.md)（待创建 - 包含 API 密钥加密等）
- [Solid Pod 集成文档](../specs/001-linx-hub/contracts/solid-pod-interactions.md)
- [LinX 数据模型](../specs/001-linx-hub/data-model.md)

---

## 10. 2025-11-08 重大进展：MainLayout 组件完成

### 10.1 完成的核心工作 ✅

**创建了真正干净的 MainLayout 组件**：

1. **纯粹的布局容器** (`/src/components/layout/NewMainLayout.tsx`)
   - 完全解耦的设计，零业务逻辑
   - 通过 props 完全控制三栏内容
   - 基于 shadcn/ui ResizablePanel 系统

2. **正确的拖拽行为**：
   - 左侧固定64px，不可拖拽 ✅
   - 中间可拖拽调整 180px-400px ✅
   - 右侧自适应，最小400px ✅

3. **统一的视觉系统**：
   - 移除所有 emoji，使用 Lucide React 图标 ✅
   - 应用 Solid Protocol 官方配色 #7C4DFF ✅
   - 严格遵循设计规范尺寸 ✅

### 10.2 技术架构亮点

**完美的抽象级别**：
```tsx
// 聊天应用
<MainLayout
  leftPanel={<ChatSidebar />}
  middlePanel={<ConversationList />}
  rightPanel={<ChatInterface />}
/>

// 联系人应用
<MainLayout
  leftPanel={<ContactSidebar />}
  middlePanel={<ContactList />}
  rightPanel={<ContactDetail />}
/>
```

**shadcn/ui 最佳实践**：
- 虽然 shadcn/ui 没有完整的应用布局组件
- 但我们很好地利用了 `ResizablePanel` 基础组件
- 创建了可复用的应用级布局框架

### 10.3 演示和测试

创建了完整的演示系统：

1. **基础演示** (`/pure`) - 展示 MainLayout 的纯粹性
2. **业务示例** (`/examples`) - 三个不同场景的切换演示
   - 聊天应用（紫色主题）
   - 联系人管理（蓝色主题）
   - 文件管理（绿色主题）

### 10.4 设计原则验证 ✅

这次实现完美验证了我们的核心设计原则：

- ✅ **足够抽象**：layout 不包含任何业务逻辑
- ✅ **完全解耦**：内容完全由子组件填充
- ✅ **设计一致**：严格遵循设计文档规范
- ✅ **技术先进**：基于现代 React 和 shadcn/ui

### 10.5 下一步讨论方向

现在我们有了坚实的布局基础，可以开始讨论：

1. **业务组件设计** - 如何设计各个具体的业务组件
2. **数据流设计** - TanStack Query + Solid Pod 的数据管理策略
3. **路由架构** - 如何使用 TanStack Router 管理不同页面
4. **状态管理** - 全局状态 vs 局部状态的分工
5. **Solid Pod 集成** - 具体的数据存取和权限管理

---

## 11. 更新日志

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2025-11-06 | 创建初始设计文档 | AI |
| 2025-11-06 | 完成核心功能定义和布局设计 | AI + User |
|  | - 确定 LinX 定位：可视化 Pod 终端 | |
|  | - 明确 6 大核心功能 | |
|  | - 设计三栏布局详细内容 | |
|  | - 规划交互流程和路由 | |
| 2025-11-06 | 完成设计规范和细节确认 | AI + User |
|  | - 创建独立的产品定位文档 | |
|  | - 添加详细的设计规范（尺寸、配色、字体） | |
|  | - 确认所有核心功能细节 | |
|  | - 明确数据存储和同步策略 | |
| 2025-11-06 | 澄清所有布局相关问题并重组文档 | AI + User |
|  | - 确认列表项高度为 70px | |
|  | - 明确拖拽功能：左右分隔线可调整宽度 | |
|  | - 拆分非布局内容到独立文档 | |
|  | - 创建 AI 集成方案文档 | |
|  | - 创建安全和加密文档 | |
| 2025-11-06 | 建立主题系统和设计令牌 | AI + User |
|  | - 引入 Shadcn/ui CSS 变量主题系统 | |
|  | - 建立基于 8px 的间距系统（Design Tokens） | |
|  | - 更新配色规范为语义化类名 | |
|  | - 创建 `theme/colors.ts` 和 `theme/spacing.ts` | |
|  | - 实现一处修改，全局生效的主题架构 | |
| 2025-11-07 | 应用 Solid Protocol 官方配色方案 | AI + User |
|  | - 研究 Solid Protocol 官方品牌色系 | |
|  | - 最终确定 #764FF6 为 Solid 官方主色 | |
|  | - 基于 Catalina Blue 设计深色背景层次 | |
|  | - 更新整个 CSS 主题变量系统 | |
|  | - 优化 ResizablePanel 尺寸配置实现 | |
|  | - 完善技术实现文档和配色说明 | |
| 2025-11-07 | 创建前端架构设计文档 | AI + User |
|  | - 分析 OpenAI ChatKit vs shadcn/ui 技术选型 | |
|  | - 创建独立的前端架构设计文档 | |
|  | - 明确主布局设计与前端架构的文档层次 | |
|  | - 重构文档结构，确保职责清晰 | |
|  | - 建立文档间的正确引用关系 | |
| **2025-11-08** | **MainLayout 组件实现完成** | **AI + User** |
|  | **- 创建真正干净的 MainLayout 组件（NewMainLayout.tsx）** | |
|  | **- 修正拖拽行为：左侧固定64px，中间可拖拽** | |
|  | **- 移除所有emoji，统一使用 Lucide React 图标** | |
|  | **- 应用 Solid Protocol 官方配色 #7C4DFF** | |
|  | **- 创建演示系统：基础演示 + 三业务场景示例** | |
|  | **- 验证设计原则：完全解耦的布局容器** | |


