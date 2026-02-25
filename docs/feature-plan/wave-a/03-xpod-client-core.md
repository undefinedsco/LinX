# feat/xpod-client-core 执行文档

> 波次：Wave A

## 1. 目标与范围

- ~~xpod/sidecar typed client（auth、retry、stream、error model）。~~
- **修订**：LinX 前端直接使用 `@openai/chatkit-react` SDK 与 xpod ChatKit 后端通信。
  不再自建 SSE 解析、流式渲染、重试逻辑。xpod-client-core 的职责收敛为**配置层和鉴权桥接**。

## 2. 依赖关系

- 入依赖：无
- 出依赖：`feat/web-chat-ui`、`feat/mobile-chat-ui`、`feat/web-session-files-ui`、`feat/mobile-session-control-ui`、`feat/cli-collector`

## 3. 架构变更（重大修订 2026-02-16）

### 3.1 变更原因

xpod-api-server 已实现完整的 **OpenAI ChatKit 协议**（`@openai/chatkit` 系），包含：
- `ChatKitService` — 线程管理、消息流式处理、tool call 审批回调
- `PtyThreadRuntime` — PTY 进程管理、ACP 协议执行
- `PodChatKitStore` — Pod 持久化（用 drizzle-solid 读写用户 Pod）

OpenAI 同时提供了 `@openai/chatkit-react` 前端 SDK，原生支持：
- 流式消息渲染
- `client_tool_call` 审批 UI
- 线程历史管理
- 自定义主题、locale、事件监听

因此，LinX 自建的 SSE 解析、消息渲染、Handler 模式全部可以被 ChatKit SDK 替代。

### 3.2 Before → After

```
Before:
ChatContentPane → useChatHandler → agent-handler (手写 SSE 解析)
                → MessageList + Inputbar (手写渲染)
                → Pod /v1/chat/completions

After:
ChatContentPane → <ChatKit /> (OpenAI SDK)
                   ↑ useChatKit() hook
                   ↑ session.fetch (Solid DPoP token)
                   → xpod-api-server /chatkit endpoint
```

### 3.3 xpod-client 包的定位变更

`packages/xpod-client/` 不再需要作为独立的 SSE client 包。其中已实现的代码：
- `sse-parser.ts` — 被 ChatKit SDK 内部的 SSE 处理替代
- `client.ts` — 被 `useChatKit()` hook 替代
- `strategy.ts` — IncomingStrategy/OutgoingStrategy 被 ChatKit 事件系统替代
- `retry.ts` — 被 ChatKit SDK 内置重连替代
- `auth.ts` — 收敛为 `session.fetch` 透传

**处置策略**：标记 `@deprecated`，保留代码以备回退。不删除。

## 4. 鉴权方案

### 4.1 认证链路

```
LinX 前端 (Alice)
    │  session.fetch 自带 Solid OIDC DPoP proof
    ↓
ChatKit SDK: api.fetch = session.fetch
    │  POST {podUrl}/chatkit
    │  Authorization: DPoP <access_token>
    │  DPoP: <proof>
    ↓
xpod-api-server
    │  SolidTokenAuthenticator:
    │    验证 JWT 签名（去 IdP JWKS endpoint）
    │    提取 webId, clientId, accessToken
    ↓
PodChatKitStore (需改造 ⚠️)
    │  当前：强制要求 clientId + clientSecret 做 Session.login()
    │  改为：支持直接用传入的 accessToken 构造 authenticated fetch
    │        透传 token 访问用户 Pod
    ↓
Alice's Pod ← 验证 token → 放行
```

### 4.2 LinX 前端（本特性范围）

不需要额外的 API Key 或凭据配置。直接用 Solid session 的 authenticated fetch：

```typescript
const { session } = useSession()

const chatKit = useChatKit({
  api: {
    url: `${podUrl}/chatkit`,
    domainKey: 'domain_pk_localhost_dev',
    fetch: session.fetch,  // DPoP token 自动附加
  },
})
```

### 4.3 xpod 侧改动（跨仓库，不在本分支范围）

`PodChatKitStore.getDb()` 当前只支持 clientId + clientSecret 模式（API Key 登录）。
需要增加一个分支：当 AuthContext 带有 accessToken（来自 SolidTokenAuthenticator）时，
直接用该 token 构造 fetch 函数访问 Pod，而不是重新 Session.login()。

> **注意**：DPoP proof 绑定 origin，浏览器生成的 proof 不能在 xpod 服务端直接重用。
> 实际方案可能是 Bearer fallback，或 xpod 作为 token relay。具体在 xpod 仓库确认。

### 4.4 domainKey

`domainKey` 是 ChatKit SDK 的反盗用机制（验证部署域名），与 Solid 认证无关。
- 开发期：`domain_pk_localhost_dev`（SDK 内置，localhost 自动通过）
- 生产期：自建后端 custom API 模式下，行为待确认

## 5. ChatKit 集成方案

### 5.1 ChatContentPane 改造

**删除**（~500 行）：
- 所有手写消息渲染逻辑（`MessageList`, `Inputbar`, `displayMessages`, streaming 拼接）
- `useChatHandler` hook 调用
- `useModelServices` 中的 API key 检查/保存卡片逻辑
- `MessageBlock` 相关的 import 和转换代码

**保留**：
- Zustand store 连接（`selectedChatId`, `selectedThreadId`）
- 空状态（未选中 chat 时的占位 UI）

**新增**（~80 行）：
- `useChatKit()` hook 配置
- `api.fetch = session.fetch`
- `<ChatKit control={chatKit.control} />` 渲染
- thread 切换同步（Zustand ↔ ChatKit）

```tsx
import { useChatKit, ChatKit } from '@openai/chatkit-react'
import { useSession } from '@inrupt/solid-ui-react'
import { useChatStore } from '../store'

export function ChatContentPane() {
  const { session } = useSession()
  const selectedChatId = useChatStore(s => s.selectedChatId)
  const selectedThreadId = useChatStore(s => s.selectedThreadId)
  const selectThread = useChatStore(s => s.selectThread)
  const podUrl = usePodUrl()

  const chatKit = useChatKit({
    api: {
      url: `${podUrl}/chatkit`,
      domainKey: 'domain_pk_localhost_dev',
      fetch: session.fetch,
    },
    locale: 'zh-CN',
    theme: {
      colorScheme: theme === 'dark' ? 'dark' : 'light',
      color: { accent: { primary: '#7C3AED', level: 2 } },
    },
    header: { enabled: false },   // LinX 有自己的 ChatHeader
    history: { enabled: false },  // LinX ChatListPane 管理列表
    composer: { placeholder: '输入消息...' },
    threadItemActions: { feedback: true, retry: true },
  })

  // 同步 LinX selectedThreadId → ChatKit
  useEffect(() => {
    if (selectedThreadId) {
      chatKit.control.setThreadId(selectedThreadId)
    }
  }, [selectedThreadId])

  if (!selectedChatId) {
    return <EmptyState />
  }

  return (
    <div className="flex-1 h-full overflow-hidden">
      <ChatKit
        control={chatKit.control}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
```

### 5.2 ChatKit 配置决策

| 项 | 决策 | 原因 |
|----|------|------|
| header | `enabled: false` | LinX 有自己的 ChatHeader（通过 useChatLayoutConfig 注入） |
| history | `enabled: false` | LinX ChatListPane 管理 Chat 级别列表；Thread 级别用右侧边栏或二级目录 |
| 后端地址 | 从 settings 读 Pod URL，拼 `/chatkit` | LinX settings 模块已管理 Pod 地址 |
| Thread 切换 | `chatKit.control.setThreadId()` 与 Zustand 同步 | ChatListPane 选中 chat → auto-select thread |
| 主题 | 映射 LinX theme → ChatKit colorScheme + 紫色 accent | 保持品牌色 |
| locale | `zh-CN` | LinX 当前以中文为主 |
| chat 类型 | 全替换无分支 | 所有 chat 类型统一走 ChatKit，群聊/P2P 后续也通过 ChatKit 协议 |

### 5.3 ChatKit 事件映射（替代原 IncomingStrategy/OutgoingStrategy）

| 原 xpod-client 接口 | ChatKit SDK 等价物 |
|---------------------|-------------------|
| `IncomingStrategy.onStreamingChunk` | ChatKit 内部处理，自动渲染 `thread.item.updated` text_delta |
| `IncomingStrategy.onStreamingThought` | ChatKit 渲染 assistant_message content parts |
| `IncomingStrategy.onToolCallStart` | ChatKit 渲染 `client_tool_call` item（status: pending） |
| `IncomingStrategy.onToolApproval` | ChatKit `client_tool_call` → 用户通过 `threads.add_client_tool_output` 回调 |
| `IncomingStrategy.onToolCallEnd` | ChatKit 渲染 `client_tool_call` item（status: completed） |
| `OutgoingStrategy.sendApproval` | ChatKit SDK 自动发送 `threads.add_client_tool_output` |
| `OutgoingStrategy.injectMessage` | `chatKit.control.sendUserMessage()` |
| SSE `Last-Event-ID` 重连 | ChatKit SDK 内置 |
| 审批 30s 超时自动拒绝 | xpod 服务端 `idleMs` / `authWaitMs` 控制 |

### 5.4 ChatKit 不覆盖的能力（后续迭代）

- **自定义消息 Block 渲染**：ChatKit 消息渲染不可自定义。如果需要特殊 block（如 task_progress），需通过 ChatKit widget 系统实现
- **离线/Pod 本地持久化**：ChatKit 线程数据由 xpod 服务端管理（PodChatKitStore），LinX 前端不直接写 Pod

## 6. 修改文件清单

### LinX 侧

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/web/package.json` | 新增依赖 | `@openai/chatkit-react: ^1.4.1` |
| `apps/web/src/modules/chat/components/ChatContentPane.tsx` | **重写** | 595 行 → ~80 行，换为 ChatKit SDK |
| `apps/web/src/modules/chat/hooks/useChatHandler.ts` | 标记 deprecated | 不再被 ChatContentPane 引用 |
| `apps/web/src/modules/chat/services/handlers/agent-handler.ts` | 标记 deprecated | SSE 解析被替代 |
| `apps/web/src/modules/chat/services/types.ts` | 标记 deprecated | ChatHandler 类型被替代 |
| `packages/xpod-client/` | 标记 deprecated | 整个包被 ChatKit SDK 替代 |
| `apps/web/src/modules/chat/store.ts` | 无修改 | Zustand 继续管理 UI 状态 |
| `apps/web/src/modules/chat/collections.ts` | 无修改 | ChatListPane 仍需要 |

### xpod 侧（跨仓库）

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/api/chatkit/pod-store.ts` | 改造 `getDb()` | 增加 accessToken 直接访问 Pod 的分支 |

## 7. 实施步骤

### LinX 侧（本分支）
1. 在 `apps/web/` 安装 `@openai/chatkit-react`
2. 重写 ChatContentPane → ChatKit SDK
3. 配置 `api.fetch = session.fetch`
4. 调整 thread 切换同步逻辑
5. 标记旧的 handler/services/xpod-client 代码为 deprecated
6. 测试：启动 xpod-api-server + LinX dev server，验证 ChatKit 连通

### xpod 侧（单独 PR）
7. `PodChatKitStore.getDb()` 增加 accessToken 直接访问 Pod 的分支
8. 确认 DPoP 透传或 token relay 方案

## 8. 代码集中回 main 的检查点

- CP0：只合并依赖变更（package.json）+ deprecated 标记，保证其他分支可继续。
- CP1：合并 ChatKit 集成（ChatContentPane 重写），必须保留 Feature Flag，默认关闭。
- CP2：合并默认入口切换，附回滚策略（旧代码已保留）。

## 9. 分支 DoD

- ChatKit SDK 安装且类型检查通过
- ChatContentPane 可渲染 ChatKit 组件（即使后端未连通，也不报错）
- 旧代码标记 deprecated，无引用编译错误
- 鉴权方案在 xpod 侧有对应 issue/PR 跟踪

## 10. 注意事项

1. **ChatKit 是 iframe-based Web Component** — CSS 不穿透，LinX Tailwind 样式不影响 ChatKit 内部
2. **Thread ID 映射** — ChatKit thread ID 和 LinX thread ID 需要是同一套
3. **全替换无分支** — 所有 chat 类型统一走 ChatKit，旧代码保留但不引用
4. **xpod DPoP 透传** — 浏览器 DPoP proof 绑定 origin，xpod 服务端不能直接重用，需确认方案

---

## 附录：已废弃的设计（保留供参考）

<details>
<summary>原 SSE 自定义事件方案（已被 ChatKit 协议替代）</summary>

### 原 SSE 事件格式

```
event: tool_use_start
data: {"toolCallId": "tc_001", "toolName": "read_file", "arguments": {"path": "/src/app.ts"}}

event: tool_use_delta
data: {"toolCallId": "tc_001", "output": "...partial output..."}

event: tool_use_end
data: {"toolCallId": "tc_001", "status": "done", "duration": 320}

event: tool_approval_required
data: {"toolCallId": "tc_002", "toolName": "delete_file", "risk": "high", "timeout": 30}
```

### 原 IncomingStrategy/OutgoingStrategy 接口

```typescript
interface IncomingStrategy {
  onStreamingChunk?: (chunk: string, messageId?: string) => void
  onStreamingThought?: (chunk: string, messageId?: string) => void
  onToolCallStart?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void
  onToolApproval?: (toolCallId: string, toolName: string, args: Record<string, unknown>, risk: RiskLevel, timeout: number) => void
  onToolCallDelta?: (toolCallId: string, output: string) => void
  onToolCallEnd?: (toolCallId: string, status: 'done' | 'error', result?: unknown, duration?: number) => void
  onDone?: () => void
  onError?: (err: Error) => void
}

interface OutgoingStrategy {
  sendApproval?: (toolCallId: string, decision: 'approved' | 'rejected') => Promise<void>
  injectMessage?: (sessionId: string, message: string) => Promise<void>
}
```

### 原 AutonomyCheck 接口

```typescript
interface AutonomyCheck {
  getLevel(): 'manual' | 'semi_auto' | 'full_auto'
  needsApproval(toolName: string, args: Record<string, unknown>): boolean
  matchesWhitelist(command: string): boolean
}
```

> 这些接口在 xpod 服务端通过 `permissionMode` + `allowedTools/disallowedTools` 实现，
> 不需要客户端参与。

</details>
