# LinX 前端 DESIGN.md 合规审查 — 需要修改清单

> 审查基准：`DESIGN.md`（2026-07-06 刷新版）、`docs/ui-style-guide.md`、`docs/ui-component-architecture.md`
> 范围：`apps/web/src` 前端全模块（基础 token / 登录 / 聊天 / Files / Settings / 可访问性）
> 方式：**只读代码审查**，未修改任何文件。审查通过 5 个并行 Explore agent 完成。
> 说明：本环境无法读取截图（图片被过滤），本报告结论均来自源码 className / CSS 静态核对，非肉眼视觉确认。

---

## 0. 严重度约定

| 级别 | 含义 | 处理节奏 |
|------|------|----------|
| **P0** | 明确违反 DESIGN「禁止」级条款（品牌/色彩红线、emoji 核心状态） | 必须修 |
| **P1** | 高优先级：半径分层冲突、可访问性硬缺口、语义色泄漏、主操作 token 偏差 | 应当修 |
| **P2** | 中优先级：细节清理、跨组件一致性、微文案、遗留类 | 顺带收口 |

---

## 1. 概览：系统性问题（先修这些）

四层基础问题横跨全站，是绝大多数 P1/P2 的根因：

1. **圆角 token 越界** — `xl=20px`、`2xl=24px`、`3xl=28px` 远超 DESIGN 对话框上限 16px，且 `lg(12px)` 与 `xl(20px)` 之间缺 16px 档 → 全站 `Card`/面板/对话框普遍误用 `rounded-2xl`(24px)（`tailwind.config.ts` / `index.css`）。
2. **彩色阴影 / 装饰渐变残留** — `spacing.ts` 的「主色发光」、`badge`/`switch` 的 `shadow-primary/20~30`、`index.css` 的 `.top-accent` 渐变，违反 §135「禁止彩色阴影/装饰渐变」。
3. **品牌皮肤泄漏** — `tailwind.config.ts` 内 `wechat` 命名空间（`#07C160` 微信绿）+ `LoginModal` 的 `violet-*` 默认紫，违反 §27/§131。
4. **可访问性两大缺口** — 全局缺 `prefers-reduced-motion`（§199-201）与全局 `:focus-visible` 兜底（§188）。

---

## 2. P0 — 必须修

### P0-1 ChatListPane 用 emoji 作为核心状态 + 散落十六进制色
- **文件**：`apps/web/src/modules/chat/components/ChatListPane.tsx:146-178`
- **现状**：
  ```ts
  active:           { text: '🟢 运行中',  color: 'text-green-600' },
  waiting_approval: { text: '⚠️ 等待确认', color: 'text-yellow-600' },
  completed:        { text: '✅ 已完成',  color: 'text-green-600' },
  error:            { text: '❌ 错误',    color: 'text-red-600' },
  // 另有 '🔐 等待认证'、'⚠️ 待处理授权…'
  ```
- **违反**：§29「noisy emoji state」、§131-135「Do not rely on emoji as core status semantics」、§194（状态不应仅靠颜色/符号）。
- **修复**：删除 emoji 前缀，保留中文标签 + Lucide 线性图标；颜色统一为语义 token `text-success` / `text-warning` / `text-destructive`。

### P0-2 LoginModal Logo/头像使用非 taro 的 violet 默认紫
- **文件**：`apps/web/src/modules/login/LoginModal.tsx:251, 775, 793`
- **现状**：`border border-violet-400/90 bg-violet-200/90 p-0.5 shadow-sm`（另 `:762` 定义 `rounded-[18%]`）
- **违反**：§29「Avoid broad purple SaaS styling」、§131-135（taro 紫 `#735FC4` 为唯一 shared accent）。
- **修复**：改为 `border-border bg-muted` 或 `border-primary/20 bg-primary/10`；徽章半径改用分层值（`rounded-lg`/`rounded-xl`），移除任意 `rounded-[18%]`。

### P0-3 WeChat 品牌色 token + 业务使用（品牌红线）
- **文件**：`apps/web/src/tailwind.config.ts:66-71`；`apps/web/src/modules/chat/components/ChatListPane.tsx:297, 339, 381, 396`
- **现状**：
  ```ts
  wechat: { unread: "#F95C5C", pinned: "#07C160", muted: "#B2B2B2" }
  // 使用：'bg-wechat-unread text-white text-[10px] font-medium'、'text-wechat-muted'
  ```
- **违反**：§27「Avoid making LinX a WeChat visual skin」；`#07C160` 为微信官方品牌绿。
- **修复**：删除 `wechat` 命名空间，改用语义 token（`unread`→`destructive`/`muted-foreground`，`pinned`→`success`，`muted`→`muted-foreground`）。

---

## 3. P1 — 应当修

### 3.1 基础层 / 全局

| # | 问题 | 位置 | DESIGN | 修复 |
|---|------|------|--------|------|
| P1-1 | 全局缺 `prefers-reduced-motion` | `index.css`（Grep 零命中） | §199-201 | `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.01ms!important; transition-duration:.01ms!important } }` |
| P1-2 | 全局缺 `:focus-visible` 兜底规则 | `index.css` `@layer base` | §188 | 增加 `*:focus-visible { @apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background }` |
| P1-3 | 默认 Button 高度 `h-10`（应 `h-9`） | `components/ui/button.tsx:20` | §64-72 | `default` 改为 `"h-9 px-4"`（`rounded-md` 保留） |
| P1-4 | Card 原语 `rounded-2xl`(24px)+`shadow-lg` | `components/ui/card.tsx:9-12` | §144-149/§149 | `rounded-lg` + 去 `shadow-lg`（或仅 `shadow-sm`）；移除「温暖守护者」遗留注释 |
| P1-5 | 装饰渐变 `.top-accent` | `index.css:314-321` | §29/§135 | 删除或用 1px 实色 `border-t` |
| P1-6 | 「主色发光」glow token | `theme/spacing.ts:135-153` | §135 | 删除 `primary`/`primarySubtle` 辉光 token；补充 16px 半径档 |
| P1-7 | AuthCallback 对话框 `rounded-2xl + shadow-2xl` | `components/AuthCallback.tsx:343` | §144-149 | `rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.10)]` |
| P1-8 | Badge 彩色阴影 + `focus:` 非 `focus-visible:` | `components/ui/badge.tsx:8,13,17` | §135/§188 | 去 `shadow-primary/20`/`shadow-destructive/20`；改 `focus-visible:ring-2` |
| P1-9 | Switch 选中彩色辉光 `shadow-primary/25` | `components/ui/switch.tsx:20` | §135 | 移除辉光，仅实色填充 + ring |
| P1-10 | 工作流 chrome 用 `backdrop-blur` | `ChatContentPane.tsx:732`、`badge.tsx:18`、`PrimaryLayout.tsx:356` | ui-style-guide Elevation | 改用实色 `bg-card`/`bg-popover` |

### 3.2 散落 `rounded-2xl`（统一改 `rounded-lg`，对话框改 `rounded-xl`）

- `apps/web/src/modules/login/LocalOnboardingCard.tsx:262, 297, 323, 354, 369`
- `apps/web/src/modules/login/LocalReachabilitySummary.tsx:17`（内部行 `:42` 又用 `rounded-xl`，层级矛盾）
- `apps/web/src/modules/settings/components/SetupView.tsx:235, 252`（含 `shadow-lg`）
- `apps/web/src/modules/settings/components/LocalNetworkSettingsCard.tsx:140, 158, 177, 188, 255`
- `apps/web/src/modules/profile/SelfProfileCard.tsx:331`（头像 `rounded-2xl`）
- `apps/web/src/modules/contacts/components/ContactDetailPane.tsx:680`（头像 `rounded-2xl`）
- `apps/web/src/components/AuthCallback.tsx:343`（见 P1-7）

### 3.3 散落语义色（raw 十六进制 / Tailwind 默认色，统一改 `--success/--warning/--destructive` token）

| 位置 | 现状 | 改 |
|------|------|----|
| `ChatListPane.tsx:148-152` | `text-green/yellow/red-600` | `text-success/warning/destructive` |
| `ToolBlock.tsx:33,36,37` | `text-green-500`/`text-amber-500`/`text-blue-500` | `text-success`/`text-warning`/定 `info` 或 taro（**蓝色二级强调违反 §134**） |
| `TaskProgressBlock.tsx:28` | `text-green-500` | `text-success` |
| `ChatHeader.tsx:277` | `text-amber-500 fill-amber-500`（收藏星标） | `text-primary`/中性 |
| `SessionInputbar.tsx:116` | `border-red-500/70` | `border-destructive/70` |
| `Inputbar.tsx:311` | `bg-red-500 hover:bg-red-600` | `bg-destructive hover:bg-destructive` |
| `Inputbar.tsx:169,355,433,434` | `amber-500`/`green-500`/`green-500/5`/`green-600` | `warning`/`success` token |
| `FileDetailPane.tsx:120` | `fill-amber-500 text-amber-500`（收藏星标） | `fill-primary text-primary`（星标是选中/品牌语义，非 warning） |
| `LoginModal.tsx:828` | `bg-sky-500`/`bg-emerald-500`（SpaceMarker） | 收敛中性 + 图标或单一 taro（§134 二级色板） |
| `SelfProfileCard.tsx:116-125,144` / `LocalOnboardingCard.tsx:125,144` | `sky-500`/`emerald-500` 存储标记 | 同上 |

### 3.4 术语边界

- **P1-11 `独立空间`/`Standalone` 泄漏进主登录模态框**（`§246` 保留给 settings/诊断/非主路径）
  - `apps/web/src/modules/login/LoginModal.tsx:550, 853, 921-922`
  - `apps/web/src/modules/login/LocalOnboardingCard.tsx:198, 355, 397`
  - **需决策**：若 Standalone 是一等登录路径，应修订 `DESIGN.md §246` 显式批准；否则登录内改用 `本机空间` 或存储中立文案，仅在 settings 暴露 `独立空间`。
- **P1-12 Files「当前空间」非规范术语**
  - `apps/web/src/modules/files/domain/list/list-view-model.ts:144, 231`
  - 改点名操作文案（如「正在从本机空间读取…」）；架构测试已断言不应含该字符串。

---

## 4. P2 — 顺带收口

| # | 问题 | 位置 | DESIGN | 修复 |
|---|------|------|--------|------|
| P2-1 | `.warm-card`/`.btn-warm` 遗留情感化类 | `index.css:303-332`（`.top-accent`/`.btn-warm` 为死代码） | §135/迁移指引 | 删除；`LoginCardShell.tsx:15-16` 改 `bg-card border rounded-xl` |
| P2-2 | 持续循环装饰动画 | `SessionControlBar.tsx:70` `animate-pulse` | §200 | `motion-reduce:animate-none` 或静态点 |
| P2-3 | 输入框半径不一致 | `LoginModal.tsx:429` `rounded-lg`（应 `rounded-md`，且 `focus:`→`focus-visible:`） | §144-149 | `rounded-md` + `focus-visible:ring-2` |
| P2-4 | Files 列表搜索框 `rounded-sm` 与结构化工具栏 `rounded-md` 不一致 | `FilesListPane.tsx:85` vs `StructuredResourceToolbar.tsx:349` | §144-149 | 列表搜索框改 `rounded-md` |
| P2-5 | 结构化工具栏 icon 按钮缺 `focus-visible` 环 | `StructuredResourceToolbar.tsx:167,196,262,358,417,471` | §188 | 补 `focus-visible:ring-2 ring-primary/35` |
| P2-6 | Files spinner 无 reduced-motion | `FilesTreePane.tsx:103` `animate-spin` | §199-201 | 补 `motion-reduce:animate-none` |
| P2-7 | 主聊天「停止生成」按钮缺 `aria-label` | `Inputbar.tsx:305-315`（纯图标） | §196 | 加 `aria-label="停止生成"` |
| P2-8 | 主聊天缺 Esc 中断绑定 | `Inputbar.tsx`（handleKeyDown 仅 Enter） | §254 | `isGenerating` 时 Esc→`onStop`，文案提示「可按 Esc 中断」 |
| P2-9 | 等待态微文案未点名操作 | `PlaceholderBlock.tsx:48`、`MessageList.tsx:63`「正在思考」 | §221 | 按 block 类型给操作名 + 「可按 Esc 中断」 |
| P2-10 | ErrorBlock 回退文案未分类失败性质 | `ErrorBlock.tsx:32`「操作失败。请稍后重试。」 | §231 | 按 `block.category` 映射「认证失败/网关异常/请求超时/重试已耗尽/本地已中断」 |
| P2-11 | ChatHeader 未内联 backend 就绪态 | `ChatHeader.tsx`（仅 provider+model） | §168 | 头部加低调运行时就绪点/徽标（语义 token，非 emoji） |
| P2-12 | textarea 缺 `focus-visible` 环 | `Inputbar.tsx:395`、`SessionInputbar.tsx:146` `focus:outline-none` | §188 | 加 `focus-visible:ring-2 ring-primary/35` |
| P2-13 | ErrorBoundary 内联 hex 绕过 token 系统 | `ErrorBoundary.tsx:35-61`（`#dc2626`/`#111827`/`borderRadius:999px`） | §258/§148 | 改用 `Button`/`destructive` + `rounded-md`，移除内联 hex |
| P2-14 | 性别符号 `♂♀⚧` 装饰 | `SelfProfileCard.tsx:24-26`、`UserProfileCard.tsx:64-65`、`ContactDetailPane.tsx:81-82` | §194 边界 | 改文字标签「男/女/非二元」或带 aria-label 中性图标 |
| P2-15 | 自定义按钮缺 `focus-visible` 环 | `LoginModal.tsx:600-607`(返回)、`:865-871`(关闭) 等 | §188 | 补 `focus-visible:ring-2 ring-primary/35` |
| P2-16 | 主聊天停止按钮红用 `red-500`（见 3.3） | `Inputbar.tsx:311` | §131-135 | `bg-destructive` |

---

## 5. 建议修复顺序（分阶段）

**阶段 A — 品牌与可访问性红线（P0 + 全局 P1）**
1. P0-2 / P0-3：Logo 改 taro 紫、删 `wechat` token 并替换 ChatListPane 使用
2. P0-1：ChatListPane 去 emoji + 散落色统一语义 token
3. P1-1 / P1-2：补全局 `prefers-reduced-motion` 与 `:focus-visible` 兜底
4. P1-3 / P1-4：Button 默认 `h-9`、Card 改 `rounded-lg` 去 shadow
5. P1-5 / P1-6：删 `.top-accent` 渐变、删「主色发光」token

**阶段 B — 半径分层与语义色收敛（P1 散落项）**
6. 收敛全部 `rounded-2xl` → `rounded-lg`（对话框 → `rounded-xl`）
7. 统一散落语义色 → `--success/--warning/--destructive`；消蓝色二级强调
8. P1-7：AuthCallback 对话框
9. P1-11/P1-12：术语边界修正（`独立空间`/`当前空间`）

**阶段 C — 细节与一致性（P2）**
10. 遗留类清理（P2-1）、icon 按钮焦点环（P2-5/P2-15）、微文案（P2-9/P2-10）、Esc 中断（P2-8）、aria（P2-7）、ErrorBoundary token 化（P2-13）

---

## 6. 待用户决策 / 澄清项

1. **`独立空间` 是否为正式登录路径？**（P1-11）— 决定是否改代码还是改 DESIGN.md §246。
2. **Cloud/Local/Standalone 存储标记**配色（P0-2 关联 / P2-2 同类）— DESIGN §155 允许"distinct but restrained"徽标，需确认绿/蓝是否批准。
3. **蓝色 running 状态**（ToolBlock `text-blue-500`）— 是否新增 `info` token，还是复用 taro。

---

## 7. 已确认合规（无需改动，作为基线）

- 主登录模态框主空间选择器严格使用 `云端空间`/`本机空间` + `使用 undefineds 账号`（§246）
- 主操作按钮 `h-9 rounded-md bg-primary`（taro）已在多处落地（§64-72）
- loading 文案点名具体操作（「正在恢复登录状态…」「正在验证身份」等，§221）
- 显式承诺不静默 Local→Cloud 回退（§229）
- Files 模块：密集表格行方形、焦点环、aria-label、无装饰性渐变/辉光基本到位
- `--primary` 严格等于 taro 紫 `hsl(252 46% 57%)`；`--success/--warning/--destructive` 语义色已定义
- AI 运行时：工具调用可见指示、人工审批入口、重试/错误 UI 方向正确（仅颜色/微文案/中断键盘可达性待补）

---

*生成方式：5 个并行 Explore agent 静态代码审查（只读），未改动任何文件。所有 file:line 来自 agent 报告，落地前建议逐条 `grep` 复核当前行号。*

---

## 8. 修复进度（阶段 A 第一批，已完成）

按用户指示**只修系统性基础项**，未做散落 raw color/rounded 的机械替换；产品判断类项暂缓。

| 项 | 状态 | 改动 |
|----|------|------|
| P0-1 emoji 核心状态 | ✅ | `ChatListPane.tsx` 去 emoji，状态色转 `text-success/warning/destructive` |
| P0-3 wechat token | ✅ | 删 `tailwind.config.ts` `wechat` 命名空间；`ChatListPane` 用量转 `destructive`/`muted-foreground` |
| P0-2 Logo 非 taro 紫 | ✅ | `LoginModal.tsx` `violet-400/200` → `border-border bg-muted`；`rounded-[18%]`→`rounded-xl` |
| index.css warm/glow/gradient | ✅ | 删 `.top-accent`/`.btn-warm`/`.warm-card-hover`；`.warm-card` 去阴影/过渡 |
| 全局 reduced-motion | ✅ | `index.css` 新增 `@media (prefers-reduced-motion: reduce)` |
| 全局 focus-visible | ✅ | `index.css` 新增 `:where(a,button,...):focus-visible` 克制焦点环兜底 |
| glow 阴影 token | ✅ | 删 `spacing.ts` `shadows.primary`/`primarySubtle` |
| Button 默认高度 | ✅ | `button.tsx` `default` `h-10`→`h-9` |
| Card 原语 | ✅ | `card.tsx` `rounded-2xl`→`rounded-lg`，去 `shadow-lg` |
| Badge 原语 | ✅ | `badge.tsx` 去彩色阴影、`focus:`→`focus-visible:`、去 `backdrop-blur` |
| Switch 原语 | ✅ | `switch.tsx` 去选中态彩色辉光 |
| 测试断言同步 | ✅ | `LoginModal.test.tsx`/`ChatListPane.test.tsx` 4 处断言更新 |

**验证**：`tsc --noEmit` 无错误；`vitest` 受影响模块 80/80 通过。

**暂缓（产品判断，未动）**：P1-11 `独立空间` 登录路径、Cloud/Local/Standalone 存储标记配色、info token（蓝 running）。
**未做（用户要求不机械替换的散落项）**：各业务文件中的 `rounded-2xl`、raw `amber`/`emerald`/`red` 等。
