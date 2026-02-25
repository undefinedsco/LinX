# UI Design Specs (WeChat Desktop Inspired)

为了统一 LinX 的视觉风格，使其更贴近“微信桌面端”的高效、紧凑和沉浸感，特制定本规范。

## 1. 核心理念 (Core Principles)
*   **紧凑 (Compact)**: 减少不必要的 Padding 和 Margin，提高信息密度。
*   **直角化 (Squared)**: 减少大圆角的使用，除了头像和特定卡片外，UI 元素趋向于微圆角或直角。
*   **无边界 (Borderless)**: 列表项通常全宽，无视觉边界，通过背景色变化响应交互。
*   **沉浸 (Immersive)**: 侧边栏使用半透明磨砂材质，内容区使用纯色或极淡背景。

## 2. 圆角系统 (Radius System)

本项目采用混合圆角策略：主界面（Chat/List）遵循“微信桌面端”的方正风格，而登录/欢迎页（Login/Welcome）遵循“温暖守护者”的圆润风格。

| 组件类型 | Tailwind Class | 像素值 (Config) | 说明 |
| :--- | :--- | :--- | :--- |
| **全局基准** | `--radius` | **12px** (md) | 默认圆角 |
| **列表项/直角** | `rounded-none` | 0px | 列表全宽铺满，无圆角 |
| **小元素** | `rounded-sm` | 8px | 较小的按钮、标签 |
| **标准容器** | `rounded-lg` | 16px | 一般卡片、浮层 |
| **登录/大卡片** | `rounded-xl` | **20px** | **特例**：LoginModal 等“温暖”风格组件使用大圆角 |
| **超大圆角** | `rounded-2xl` | 24px | 特殊装饰背景 |

> **注意**: `index.css` 中定义了温暖风格的一套圆角系统 (`sm: 8px`, `md: 12px`, `xl: 20px`)。
> *   **主界面 (Main App)**: 应通过 `rounded-none` 或 `rounded-sm` 强制覆盖，以保持紧凑感。
> *   **登录页 (Login)**: 保留 `rounded-xl` (20px) 以维持亲和力。

## 3. 列表视图 (List View)

列表（如聊天列表、联系人列表）是应用的核心交互区。

*   **Item 布局**:
    *   **Margin**: `mx-0` (无左右边距)。
    *   **Padding**: `px-3 py-3` (内部维持呼吸感，但外部贴边)。
    *   **Hover**: `hover:bg-[#0000000D]` (浅黑遮罩) 或 `hover:bg-[#FFFFFF1A]` (深色模式)。
    *   **Active**: `bg-[#C8C8C8]` (选中态明显，灰色而非品牌色)。
*   **分割线**: 通常不需要显式分割线，靠 Hover 区分，或者使用极其微弱的 `border-b`。

## 4. 搜索框 (Search Bar)

*   **背景**: 比所在面板的背景**更深**（如侧边栏是 `#F7F7F7`，搜索框是 `#E2E2E2`）。
*   **圆角**: `rounded-sm` (4px)。
*   **高度**: `h-8` (32px) 或 `h-7` (28px)，非常紧凑。
*   **图标**: 搜索图标居中或居左，颜色为 `text-muted-foreground`。

## 5. 颜色微调 (Colors)

*   **选中态 (Selection)**: 微信列表选中通常是 **中性灰**，而不是品牌色（紫色）。品牌色仅用于“发消息”按钮、Primary Button 等关键操作。
*   **背景**:
    *   **侧边栏**: `#F7F7F7` (Light) / `#1E1E1E` (Dark)
    *   **列表栏**: `#EBEBEB` (Light) / `#2D2D2D` (Dark)
    *   **内容区**: `#F5F5F5` (Light) / `#111111` (Dark)

## 6. 交互模式 (Interaction Patterns)

### 表单与输入 (Input & Forms)
*   **行内编辑 (Inline Edit)**:
    *   **触发**: 点击文本内容（或右侧隐式编辑图标）。
    *   **状态**: 原地变为 Input，文本**全选**。
    *   **保存**: `Enter` 键或点击外部区域（Blur）。
    *   **取消**: `Esc` 键。
    *   **视觉**: 聚焦时显示极细的品牌色边框 (`ring-1 ring-primary`)。
*   **详情页展示**:
    *   **Label**: 灰色 (`text-muted-foreground`)，左对齐。
    *   **Value**: 黑色/白色 (`text-foreground`)，右对齐或左对齐（视字段长度）。
    *   **分隔**: 每一行之间有极淡的分割线 (`border-border/30`)。

### 右键菜单 (Context Menu)
*   **场景**: 列表项（删除、置顶）、消息气泡（复制、引用）。
*   **样式**: 纯白/深灰背景，阴影 `shadow-md`，无圆角或 `rounded-sm`。
*   **选中**: 鼠标划过菜单项变蓝 (`bg-primary text-white`) 或变灰（视系统风格）。

### 模态框 (Modals)
*   **位置**: 屏幕正中。
*   **按钮**:
    *   **主操作 (Primary)**: 右侧，品牌色填充。
    *   **次操作 (Secondary/Cancel)**: 左侧，描边或幽灵按钮。
*   **关闭**: 右上角 `X` 或点击遮罩（视操作重要性，重要表单不许点遮罩关闭）。

### 反馈 (Feedback)
*   **Toast**: 操作成功（如复制、保存）显示黑色胶囊 Toast，居中，1.5秒自动消失。
*   **Loading**: 局部 Loading 优先（如按钮变转圈），避免全屏遮罩。

## 7. 待修改项清单 (Action Items)

1.  **Global CSS**: 将 Shadcn 的 `--radius` 从 `0.5rem` 改为 `0.25rem` (4px)。
2.  **ResourceList / ChatList**:
    *   移除 `px-2` container padding。
    *   移除 Item 的 `border` 和 `rounded-lg`。
    *   改为 `rounded-none` 和全宽 Hover。
3.  **Avatar**: 统一改为 `rounded-sm`。
4.  **Search Input**: 调整背景色和圆角。
5.  **EditableField**: 优化 Input 聚焦样式，确保全选逻辑。
