# feat/web-session-files-ui 执行文档

> 波次：Wave B

## 1. 目标与范围

- Web Project Session + Files 壳层（优先 xpod sidecar）。

## 2. 依赖关系

- 入依赖：`feat/contracts-chat-contact`、`feat/xpod-client-core`
- 出依赖：`feat/mcp-bridge`

## 3. 分阶段计划

### Phase 0（Contract Baseline）

- 冻结最小接口与数据结构，补齐 fixture。
- 先打通最小读/写路径，不追求完整交互。

### Phase 1（Vertical Slice）

- 打通端到端主链路（可灰度）。
- 完成核心场景自动化测试与手工演示路径。

### Phase 2（Hardening & Cutover）

- 完成稳定性、错误态、可观测性收敛。
- 完成默认入口切换与旧逻辑清理。

## 4. 代码集中回 main 的检查点

- CP0：只合并契约/类型/骨架，保证其他并发分支可继续。
- CP1：合并可运行链路，必须保留 Feature Flag，默认关闭。
- CP2：合并默认入口切换，附回滚策略。

## 5. 分支 DoD

- 契约测试通过（字段/事件/版本）。
- 至少 1 条端到端主链路可跑通。
- 关键失败路径有明确错误处理。
- 对应文档和迁移说明已更新。

## 6. 测试契约（并发开发必填）

- Test Owner：`TBD`
- Required Suites：`TBD`（至少包含 unit/integration/min-e2e）
- Upstream Contract Version：`TBD`
- Downstream Smoke：`TBD`（至少 1 个下游场景）

---

## 6A. Solid 数据建模规范

> Web Session + Files UI 是 CLI Session 的主要展示层，不定义新的 Pod 表。
> 本节说明 Session 相关字段的读取和控制栏的数据绑定。

### 6A.1 消费的上游 Vocab

| 上游 Wave | Vocab | UI 组件 | 消费字段 |
|-----------|-------|---------|---------|
| 01 | `CLISessionVocab` | SessionHeader | `sessionStatus`, `sessionTool`, `tokenUsage`, `parentThreadId` |
| 01 | `ChatBaseVocab` | SessionListItem | `chatType='cli_session'`, `title`, `lastActiveAt` |
| 01 | `MessageVocab` | SessionMessageList | `richContent` (ToolBlock, ThinkingBlock, DiffBlock) |
| 02 | `InboxVocab` | SessionControlBar | 待审批数量 badge, 审批操作 |

### 6A.2 Session 状态 → UI 状态映射

| `sessionStatus` 值 | 列表项预览 | 控制栏状态 | 可用操作 |
|-------------------|-----------|-----------|---------|
| `active` | 🟢 运行中 | 绿色脉冲指示灯 | Pause, Stop, Inject Message |
| `paused` | ⏸️ 已暂停 | 黄色静态指示灯 | Resume, Stop |
| `completed` | ✅ 已完成 | 灰色 | 查看历史 |
| `error` | ❌ 出错 | 红色 | 查看错误, 重试 |

### 6A.3 File 变更追踪

Session 中的文件变更通过 `richContent` 中的 `ToolBlock (write)` + `diff` 字段追踪：

| 数据来源 | UI 组件 | 说明 |
|---------|---------|------|
| `ToolBlock.toolName='write_file'` | FileChangeList | 变更文件列表 |
| `ToolBlock.diff` | DiffPreview | 内联 diff 预览 |
| `fileTable` | FileExplorer | Pod 中的文件索引（如有同步） |

### 6A.4 不新增 Pod 表

Web Session + Files UI 不新增任何 Pod 表。

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 Web Session + Files UI 中 CLI session 的呈现和控制交互。

### 7.1 CLI Session 列表项

ChatListPane 中 `chatType='cli_session'` 的列表项需要差异化渲染：

```
┌─────────────────────────────────────────────────────────┐
│ [Claude Code 图标] linx-web 重构                  10:30 │
│ 🟢 运行中 · 1.2k tokens · src/modules/chat/...         │
├─────────────────────────────────────────────────────────┤
│ [Cursor 图标] API 端点修复                        09:15 │
│ ✅ 已完成 · 3.4k tokens · 修改了 5 个文件               │
├─────────────────────────────────────────────────────────┤
│ [Claude Code 图标] 数据库迁移                     昨天  │
│ ❌ 错误 · 超时                                          │
└─────────────────────────────────────────────────────────┘
```

#### 列表项视觉规格

| 字段 | 位置 | 样式 |
|------|------|------|
| CLI 工具图标 | 左侧 40x40 | 根据 `sessionTool` 显示对应 logo |
| Session 标题 | 右上 | `text-sm font-medium` |
| 时间 | 右上角 | `text-xs text-muted-foreground` |
| 状态标签 | 左下 | 🟢运行中(green) / ⏸暂停(yellow) / ✅已完成(green) / ❌错误(red) |
| Token 用量 | 状态后 | `text-xs text-muted-foreground` |
| 当前文件/摘要 | 末尾 | `text-xs text-muted-foreground truncate` |

### 7.2 CLI Session 内容面板

选中 CLI session 后，ChatContentPane 切换为 session 模式（`variant='cli'`）：

```
┌─────────────────────────────────────────────────────────┐
│ linx-web 重构                                           │
│ 🟢 运行中 · Claude Code · 1.2k tokens · 3分钟           │
│ [⏸暂停] [⏹停止] [📋复制日志]                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [System] 项目: /Users/ganlu/develop/linx                │
│                                                          │
│  [User] 重构 chat 模块的 collections                     │
│                                                          │
│  [Claude] 💭 分析当前代码结构...                          │
│           🔧 Read apps/web/src/modules/chat/collections.ts │
│           🔧 Read packages/models/src/chat.schema.ts     │
│           💭 设计重构方案...                               │
│           📝 Write apps/web/src/modules/chat/collections.ts │
│              ┌─ diff ──────────────────────────┐         │
│              │ - const chatCollection = ...     │         │
│              │ + const chatCollection = ...     │         │
│              └─────────────────────────────────┘         │
│           ✅ 文件已保存                                   │
│                                                          │
│  [⚠️ 等待确认] Claude 请求执行 `yarn test`               │
│  [✅ 允许] [❌ 拒绝] [✅ 允许所有测试命令]                │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ [消息注入: 输入指令发送给 CLI session]        [发送 ➤]   │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Session 控制栏

内容面板顶部的控制栏，显示 session 元信息和操作按钮：

```typescript
interface SessionControlBar {
  title: string           // session 标题
  status: 'active' | 'paused' | 'completed' | 'error'
  tool: string            // CLI 工具名
  tokenUsage: number      // 已消耗 token
  duration: string        // 运行时长（格式化）
  actions: {
    pause: () => void     // 暂停 session
    resume: () => void    // 恢复 session
    stop: () => void      // 停止 session
    copyLog: () => void   // 复制完整日志
  }
}
```

#### 按钮状态

| Session 状态 | 可用按钮 | 禁用按钮 |
|-------------|---------|---------|
| `active` | ⏸暂停, ⏹停止, 📋复制 | ▶恢复 |
| `paused` | ▶恢复, ⏹停止, 📋复制 | ⏸暂停 |
| `completed` | 📋复制 | ⏸暂停, ▶恢复, ⏹停止 |
| `error` | 📋复制 | ⏸暂停, ▶恢复, ⏹停止 |

### 7.4 消息流渲染（variant='cli'）

CLI session 的消息流复用 MessageList 组件，但渲染逻辑有差异：

| Block 类型 | 渲染方式 | 说明 |
|-----------|---------|------|
| System message | 灰色居中文字 | 项目路径、环境信息 |
| User message | 右对齐气泡 | 用户发送的指令 |
| ThinkingBlock | 💭 前缀 + 折叠 | AI 思考过程 |
| ToolCallBlock (read) | 🔧 前缀 + 文件路径 | 文件读取操作 |
| ToolCallBlock (write) | 📝 前缀 + diff 预览 | 文件写入操作，内联 diff |
| ToolApprovalBlock | ⚠️ 黄色卡片 | 命令执行审批 |
| TextBlock | 普通文本 | AI 的文字回复 |

#### Diff 预览组件

文件写入操作需要内联显示 diff：

```
┌─ diff: src/modules/chat/collections.ts ────────────┐
│  42 │ - const chatCollection = createCollection(...)  │
│  42 │ + const chatCollection = createPodCollection({  │
│  43 │ +   table: chatTable,                           │
│  44 │ +   queryKey: ['chats'],                        │
│  45 │ + })                                            │
└────────────────────────────────────────────────────┘
```

- 背景：`bg-muted/30`
- 删除行：`bg-red-500/10 text-red-600`
- 新增行：`bg-green-500/10 text-green-600`
- 默认折叠超过 10 行的 diff，显示 "展开 N 行变更"
- 字体：`font-mono text-xs`

### 7.5 CLI Session 审批卡片

CLI session 的审批卡片与普通 AI chat 不同，支持"允许所有同类操作"：

```
┌─────────────────────────────────────────────────────────┐
│  ⚠️ Claude 请求执行命令                                  │
│                                                          │
│  $ yarn test                                             │
│                                                          │
│  [❌ 拒绝]  [✅ 允许]  [✅ 允许所有测试命令]              │
└─────────────────────────────────────────────────────────┘
```

- "允许所有同类操作"：按工具类型或命令模式批量授权（如 `yarn *`, `npm test`）
- 批量授权在 session 结束后自动失效
- 批量授权记录显示在控制栏下方：`已自动允许: yarn *, npm test`

### 7.6 底部输入栏（Session 注入）

CLI session 的底部输入栏用于向 CLI session 注入指令，而非与 AI 对话：

- Placeholder: "输入指令发送给 CLI session..."
- 发送后调用 `OutgoingStrategy.injectMessage(sessionId, message)`
- 无 @mention、无文件附件、无深度思考开关
- 支持 Ctrl+C 快捷键发送中断信号

### 7.7 关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `chat/components/ChatContentPane.tsx` | 修改 | 根据 chatType 切换 variant='cli' |
| `chat/components/SessionControlBar.tsx` | 新增 | Session 控制栏组件 |
| `chat/components/Messages/Blocks/DiffPreview.tsx` | 新增 | Diff 预览组件 |
| `chat/components/Messages/MessageList.tsx` | 修改 | 支持 variant='cli' 渲染逻辑 |
| `chat/components/Inputbar/SessionInputbar.tsx` | 新增 | CLI session 专用输入栏 |
| `chat/components/ChatListPane.tsx` | 修改 | CLI session 列表项渲染 |

---

## 8. Files 模块展示规格（补充明确）

> 结论：此前文档对 Files 仅描述了“壳层与数据入口”，**不够清晰**。
> 本节补齐“树型列表展示什么、右侧展示什么”的明确规格，作为 Wave B 的默认实现目标。

### 8.1 页面分栏（Web）

采用 `PrimaryLayout` 的三段式：

1. 左栏（ListPane）：`FilesTreePane`（树型导航）
2. 中栏（ContentPane 主区）：`FilesListPane`（当前节点下文件列表）
3. 右栏（rightSidebar）：`FileDetailPane`（文件详情/预览）

默认宽度建议：左 20% / 中 55% / 右 25%（最小宽度：220 / 480 / 280）。

### 8.2 左侧树型列表展示内容（必须项）

左栏不是“纯文件夹树”，而是“虚拟分组 + 真实目录”的混合树：

1. `全部文件`（虚拟根）
2. `最近修改`（最近 7 天）
3. `已标星`（`file.starred = true`）
4. `按会话`（Session 分组）
   - 子节点：`Session/<sessionId>/<folder...>`
5. `导入数据`（Import 分组）
   - 子节点：`Source/<importSourceId>/<targetEntity=files>/<folder...>`
6. `Pod 目录`（真实目录树）
   - 由 `file.folder` + `file.podUri` 构建路径节点

每个节点显示：

- 名称
- 数量徽标（文件数）
- 同步状态聚合点（有 `error/conflict` 时显示红/黄点）

### 8.3 中间列表区展示内容（当前树节点上下文）

选中任一树节点后，中栏展示该节点下文件表格/列表：

- 列：`name`、`mimeType`、`size`、`modifiedAt`、`syncStatus`、`starred`
- 交互：排序、关键字搜索、按类型筛选（mimeType/扩展名）、多选、批量标星
- 双击文件：打开右栏预览并高亮选中
- 双击文件夹行：下钻到对应树节点

空态规则：

- 无数据：提示“当前分组暂无文件” + 引导“去导入数据 / 新建文件”
- 加载失败：展示错误摘要 + `重试`

### 8.4 右侧详情区展示内容（文件级）

右栏仅在“选中文件”时显示，采用 Tab 结构：

1. `预览`（Preview）
   - 文本/Markdown：代码块或富文本预览
   - 图片：缩略图 + 原图打开
   - Turtle（`.ttl`）：默认“多维表格”视图（见 8.4.1）
   - 其他格式：文件信息卡 + 下载/在 Pod 打开

2. `元数据`（Metadata）
   - 基础：`id`、`name`、`podUri`、`mimeType`、`size`、`hash`
   - 归属：`owner`、`folder`、`tags`、`starred`
   - 时间：`createdAt`、`modifiedAt`、`lastSyncedAt`
   - 同步：`syncStatus`、失败原因（如有）

3. `来源`（Lineage）
   - 来源类型：`manual` / `session` / `import`
   - 若为 session：显示 `sessionId`，支持“跳转到对应 CLI Session”
   - 若为 import：显示 `importSourceId`、`mappingId`、最近 `runId`，支持“跳转到导入记录”

右栏头部固定操作：

- `打开原路径`
- `复制 Pod URI`
- `标星/取消标星`
- `删除（软删除）`

### 8.4.1 `.ttl` 多维表格展示规范（RDF 友好）

`.ttl` 文件默认不是纯文本阅读，而是结构化“多维表格”视图，规则如下：

1. 行（Row）
   - 以 `subject` 为主键聚合（每个 subject 一行）

2. 列（Column）
   - 默认列：`subject` + 高频 predicates（自动统计 Top N）
   - 自定义表头：用户输入任意 predicate（IRI 或前缀形式）后，即新增一列
   - 列支持显示/隐藏、拖拽排序、保存为视图预设

3. 单元格（Cell）
   - 同一 subject + predicate 多值时，显示为多值集合（chips / 换行）
   - 字面量显示语言标签与 datatype（如 `@zh`、`xsd:dateTime`）
   - 资源对象显示为可点击 URI（支持跳转/复制）

4. 视图切换
   - `Table`（默认） / `Raw TTL`（源码） / `Triples`（S-P-O 明细）
   - 解析失败时自动回退到 `Raw TTL`，并给出错误位置（line/column）

5. 检索与过滤
   - 全局搜索：匹配 `subject/predicate/object`
   - predicate 过滤器：仅显示选定 predicates 的列
   - 类型过滤器：基于 `rdf:type`（或映射类型字段）筛选行

6. 性能约束（MVP）
   - 首屏先渲染前 1000 个 subject（虚拟滚动）
   - 超大 `.ttl` 文件默认延迟解析，优先可交互

### 8.4.2 自定义 predicate 与 Namespace 治理

为避免“自定义列可配但不可复用/不可管控”，补充以下约束：

1. 存储位置（分层）
   - 运行态（临时）：Zustand UI state（当前页面会话态，不持久化）
   - 持久化（用户级）：`settingsTable` JSON 配置
     - `key = ui.files.ttl.namespaces`：用户自定义前缀映射（`prefix -> iri`）
     - `key = ui.files.ttl.columnPresets`：TTL 表格列预设（predicate 列集合、顺序、可见性）

2. 解析优先级
   - 优先使用文件内 `@prefix`
   - 其次使用系统命名空间（`packages/models/src/namespaces.ts`）
   - 最后使用用户自定义命名空间（`ui.files.ttl.namespaces`）

3. 冲突与安全规则
   - 保留前缀（如 `rdf/rdfs/xsd/owl/schema/foaf/vcard/dcterms/ldp`）不可被覆盖
   - 自定义前缀必须匹配 `^[a-z][a-z0-9_-]{1,31}$`
   - namespace IRI 必须是绝对 IRI（建议 `http(s)://...#` 或 `http(s)://.../`）

4. 治理流程（最小）
   - 用户新增 predicate 列时，若前缀未解析，先弹出“命名空间绑定”对话框
   - 保存时记录 `updatedAt`，并保留最近 N 次历史（用于回滚列配置）
   - 跨团队共享前缀需走契约评审，回写系统命名空间常量后再推广

5. 与导入链路的一致性
   - `import-center` 的字段映射写入 Pod 时，必须将 predicate 归一化为绝对 IRI
   - UI 显示可用前缀缩写，但落库/比较一律使用绝对 IRI

### 8.5 与 Import/Favorites 的联动约束

- Files 的 `starred` 变更必须通过 hooks 上报到 favorites（`feat/favorites-hub`）。
- Import 进入 files 的记录必须附带来源信息（最少 `importSourceId + mappingId + runId`），供右栏“来源”展示。
- 来自 import 的文件在中栏增加来源徽标（`Imported`）。

### 8.6 验收标准（Files 视角）

满足以下条件才视为“Files 模块展示已清晰并可实现”：

1. 树节点定义完整且可由当前模型字段推导
2. 中栏字段与排序/搜索行为可测试
3. 右栏三类信息（预览/元数据/来源）可稳定渲染
4. Session 跳转与 Import 跳转链路可跑通
5. 标星联动到 favorites 的主链路通过最小 e2e
6. 自定义 predicate 的 namespace 可持久化、可回放、可校验
