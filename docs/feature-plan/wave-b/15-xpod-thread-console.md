# feat/xpod-thread-console 执行文档

> 波次：Wave B（业务层 / 本机单用户控制台）
> 状态：Draft（为 xpod 开发提供最小可交付规格）

## 1. 目标与范围

交付一个“Thread 控制台”，用于在 **本机单用户** 场景下：

- 启动/停止 1 个或多个 CLI Agent（优先 CodeBuddy；可扩展 Claude Code / Gemini CLI / Codex）
- 在 UI 中向 Agent **发送一条消息**并看到 **流式回复**
- 支持上传/发送截图（最小形态：落盘后把文件路径注入 prompt）
- 不做会话消息持久化：**历史由 CLI 自己管理**（或由工作目录中的日志文件管理）

> 约束：不依赖 IDE；UI 仅做 thread 可视化与控制；服务端（xpod/LinX service）负责进程管理与事件转发。

## 2. 非目标（明确不做）

- 不做跨设备/跨端同步（本机 localhost）
- 不做 Pod 级别的 message/inbox/audit 落库与回放（暂不进入 Wave C 的 MCP Bridge 体系）
- 不做复杂权限/多租户（仅 localhost 可访问）
- 不追求“完全还原 CLI 的 TUI 交互”（方向偏结构化 thread，而非嵌入式终端）

## 3. 架构决策（最小可达）

### 3.1 Runner 分层（必须可插拔）

为降低早期复杂度，同时保留未来扩展 ACP 的路径：

- `PtyRunner`（MVP 默认）：spawn 原生 CLI（stdio/pty），转发 stdout/stderr 为事件流
- `AcpRunner`（可选增强）：当 CLI 支持 ACP（或通过 adapter 支持）时，走结构化事件

UI 与服务端之间只认统一的 `ThreadEvent` 流，不直接耦合 runner 类型。

### 3.2 事件总线：ThreadEvent（协议稳定点）

统一事件 envelope（服务端输出给 UI）：

```ts
type ThreadEvent =
  | { type: 'meta'; ts: number; threadId: string; runner: string; workdir: string }
  | { type: 'status'; ts: number; threadId: string; status: 'idle' | 'running' | 'exited' | 'error' }
  | { type: 'stdout'; ts: number; threadId: string; text: string }
  | { type: 'stderr'; ts: number; threadId: string; text: string }
  | { type: 'assistant_delta'; ts: number; threadId: string; text: string } // 结构化流式（未来）
  | { type: 'exit'; ts: number; threadId: string; code: number | null; signal?: string }
  | { type: 'error'; ts: number; threadId: string; message: string };
```

> MVP 至少需要：`meta/status/stdout/stderr/exit/error`。`assistant_delta` 预留给 ACP 或后续解析器。

## 4. API 协议（HTTP + SSE，localhost）

### 4.1 创建 thread

`POST /api/threads`

Request：
```json
{
  "title": "Fix chat scroll",
  "repoPath": "/Users/ganlu/develop/linx",
  "worktree": {
    "mode": "existing",
    "path": "/Users/ganlu/develop/linx"
  },
  "runner": {
    "type": "codebuddy",
    "mode": "pty",
    "argv": ["codebuddy", "--print", "--output-format", "stream-json"]
  }
}
```

Response：
```json
{ "id": "thread_abc123", "workdir": "/Users/ganlu/develop/linx", "status": "idle" }
```

说明：
- worktree 先支持 `existing`，后续可加 `create`（自动 `git worktree add`）。
- `argv` 允许不同 CLI 传参；MVP 优先跑通 CodeBuddy。

### 4.2 启动/停止

- `POST /api/threads/:id/start`
- `POST /api/threads/:id/stop`（默认 SIGINT；可选 SIGTERM）

### 4.3 发送用户消息（最小交互）

`POST /api/threads/:id/message`

Request：
```json
{ "text": "把这段代码重构成可测试的函数，并给出 diff" }
```

约定：
- 服务端将消息写入 runner（PTY：写入 stdin + `\n`；ACP：prompt 调用）
- 回复通过 SSE 事件流回传

### 4.4 上传截图（最小：落盘 + 引用路径）

`POST /api/threads/:id/assets`

- `multipart/form-data`
- 字段：`file`

Response：
```json
{ "assetId": "asset_xyz", "path": "/.../thread-assets/asset_xyz.png" }
```

随后 UI 发送消息时可引用：
```json
{ "text": "请基于这张截图分析 UI bug：/path/to/asset_xyz.png" }
```

> 注：这是“最小可达”。更理想的形态是 runner 支持图像作为结构化输入（ACP 或模型 API），但不作为 MVP 阻塞项。

### 4.5 事件流（SSE）

`GET /api/threads/:id/events`

- `Content-Type: text/event-stream`
- data 为 `ThreadEvent` JSON

## 5. UI 规格（最小可交付）

- Thread 列表：title + status + last activity
- Thread 详情：
  - 输入框（发送一条 text message）
  - 上传截图（drag/drop 或 file picker）
  - 输出区域（按事件流 append；MVP 可直接显示 stdout/stderr 合并视图）
- 控制按钮：Start / Stop

## 6. 安全与边界（本机单用户）

- Server 只监听 `127.0.0.1`
- 不持久化任何 access token（Solid token 如需使用，仅请求内校验）
- thread workdir 访问限制：
  - MVP：仅允许 `repoPath` 下的目录（防止任意路径执行）
  - 允许写入 thread assets/logs 到受控目录（例如 `${repoPath}/.thread-assets` 或系统 tmp）

## 7. 分阶段计划（CP0/CP1/CP2）

### CP0（骨架跑通）

- 建立 Thread 数据结构（内存 + 可选本地 JSON）
- 实现 `POST /threads`、`GET /threads`、`GET /events`（可返回 mock）
- Web UI 页面可打开并看到 mock stream

### CP1（端到端：发一句话 → 流式回复）

- `PtyRunner` 跑通 CodeBuddy（优先用 `--print --output-format stream-json`）
- `/message` 写入 stdin；SSE 推回 stdout/stderr
- `/assets` 上传落盘，并能在 prompt 中引用路径

### CP2（稳定性与可扩展）

- 进程重启/崩溃处理（exit → status 更新）
- stop 行为稳定（SIGINT/SIGTERM 兜底）
- 输出流 backpressure（SSE client 断开时清理）
- runner 插拔点落地（为 `AcpRunner` 预留接口）

## 8. DoD（完成定义）

- 本机 `yarn dev` 后可在 UI：
  - 创建 thread
  - 启动 CodeBuddy runner
  - 发送一条消息并看到流式输出
  - 上传一张截图，并能在后续消息里引用其路径
  - stop 能中断进程，状态正确更新
- 无敏感信息落盘（除 thread assets/logs）
- 文档补齐：API/事件 schema 在本文件固定为 v0.1

