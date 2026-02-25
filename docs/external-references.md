# External Code References

## Chat UI Projects

### Cherry Studio (MIT)
- **Repo**: https://github.com/CherryHQ/cherry-studio
- **参考**: Markdown 渲染、消息组件、Block 系统设计
- **关键目录**:
  - `src/renderer/src/pages/home/Messages/`
  - `src/renderer/src/pages/home/Markdown/`

### LobeChat (MIT)
- **Repo**: https://github.com/lobehub/lobe-chat
- **参考**: 交互设计、主题系统、对话分支
- **特色功能**: CoT 可视化、Artifacts、分支对话、MCP 插件
- **技术栈**: Next.js + TypeScript

### assistant-ui (MIT)
- **Repo**: https://github.com/assistant-ui/assistant-ui
- **用途**: React 聊天组件 (基于 shadcn/ui)
- **提供**: Markdown 渲染、代码高亮、流式响应、Tool Calls
- **包**: `@assistant-ui/react`

## Feature Priority Matrix

| 功能 | Cherry Studio | LobeChat | 优先级 |
|------|--------------|----------|--------|
| Markdown + 代码高亮 | ✅ | ✅ | P0 |
| 流式响应 | ✅ | ✅ | P0 |
| 消息操作栏 | ✅ | ✅ | P0 |
| 思考过程 (CoT) | ✅ | ✅ | P0 |
| 分支对话 | ❌ | ✅ | P1 |
| Artifacts 预览 | ❌ | ✅ | P1 |
| Mermaid 图表 | ✅ | ✅ | P1 |
| 多主题 | ✅ | ✅ | P2 |
| 语音输入 | ✅ | ✅ | P2 |

## AI Assistant Infrastructure

### OpenClaw (MIT)
- **Repo**: https://github.com/openclaw/openclaw
- **定位**: 本地运行的个人 AI 助手，多渠道统一收件箱
- **技术栈**: TypeScript + Node ≥22，Gateway WS 控制面

#### 值得参考的设计（源码验证）

**Exec Approval 三选一决策模型** (`src/infra/exec-approvals.ts`)
- `ExecApprovalDecision = "allow-once" | "allow-always" | "deny"`
- `allow-always` 自动将命令路径加入 allowlist，后续同命令不再询问
- 三层安全策略：`ExecSecurity = "deny" | "allowlist" | "full"`
- 三种询问模式：`ExecAsk = "off" | "on-miss" | "always"`（对标我们的 `manual | semi_auto | full_auto`）
- Safe bins 白名单：`jq, grep, sort` 等默认安全命令免审批
- **LinX 适配**：决策模型可复用，但存储从本地文件改为 Pod 策略资源，受 Solid ACL 保护。`decisionBy: human | secretary | system` 和 `onBehalfOf` 解决多用户委托审批。

**Tool Event Streaming** (`src/gateway/server-chat.ts`)
- 事件流分三种 stream：`assistant`（文本）、`tool`（工具调用）、`lifecycle`（开始/结束/错误）
- seq 递增序号，客户端可检测 gap
- 文本 delta 每 150ms 节流，避免 WS 拥塞
- `ToolEventRecipientRegistry` 定向推送：只把 tool 事件发给注册了 tool-events capability 的连接
- **LinX 适配**：数据在 Pod，订阅走 Solid Notification（轻量客户端行为）。seq 序号和节流机制在客户端侧仍有用。

**分平台命令权限** (`src/gateway/node-command-policy.ts`)
- 按平台（iOS/Android/macOS/Linux）定义默认命令白名单
- 危险命令（camera.snap, screen.record, sms.send）需显式 opt-in
- `allowCommands` / `denyCommands` 配置覆盖
- **LinX 适配**：可参考写进 `AutonomySettings`，桌面端和移动端默认权限不同。

#### 不适用于 LinX 的部分

- **Multi-channel routing**（`src/routing/resolve-route.ts`）：OpenClaw 需要复杂路由因为它要把 WhatsApp/Telegram/Slack 消息路由到不同 agent。LinX 架构不同——外部 IM 数据通过 Import Plugin 进 Pod 后标记 `sourceChannel`，回发是 Export Plugin 的职责，核心架构不管路由。
- **Control UI**：只是静态文件服务器 + avatar 代理，无富交互。
- **A2UI Canvas**：WebView 注入 JS bridge，和 LinX content pane 设计方向不同。
- **Transcript events**：极简文件变更通知，无结构化 block 模型。LinX 的 `richContent` JSON block 序列化更成熟。

---

## Solid Ecosystem

### SolidOS
- **Repo**: https://github.com/SolidOS
- **用途**: 参考标准 Solid 数据结构，确保与 SolidOS 应用互操作
- **本地 Schema**: `packages/models/src/schemas/solid-os/`
