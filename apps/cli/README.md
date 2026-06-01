# LinX CLI

最小用户聊天 CLI，复用 LinX 的 Pod 数据模型和 LinX server 的 OpenAI-compatible API。

- cloud account/login 默认走 `https://id.undefineds.co/.account/*`
- cloud chat/models 走 live `https://api.undefineds.co/v1/*`
- 内置 discovery snapshot 只做离线 fallback，不替代 live `/v1/models`
- 官方云默认分流：`id` 负责 Solid/OIDC，`pods` 负责 Pod 托管域，`api` 负责 chat/models runtime；自建 Pod 默认仍走同源

## Commands

```bash
# 浏览器授权登录并保存本地 xPod/LinX/Solid OIDC 会话
# 默认用官方 cloud identity：https://id.undefineds.co
yarn workspace @undefineds.co/linx dev login

# 自建 / 本地 issuer 时再显式覆盖
yarn workspace @undefineds.co/linx dev login --url http://localhost:3000

# 查看 / 清理当前本地 xPod/LinX/Solid 登录态
yarn workspace @undefineds.co/linx dev whoami --verbose
yarn workspace @undefineds.co/linx dev logout

# Connect AI: 把 OpenAI / Anthropic / Codex-compatible 等 provider 凭据写进 Pod
yarn workspace @undefineds.co/linx dev ai connect claude --api-key sk-ant-xxx --model claude-sonnet-4-20250514
yarn workspace @undefineds.co/linx dev ai status claude
yarn workspace @undefineds.co/linx dev ai disconnect claude

# 列出远程可用模型
yarn workspace @undefineds.co/linx dev models

# 单轮聊天
yarn workspace @undefineds.co/linx dev chat "帮我总结一下今天的工作"

# 进入默认 Pi TUI
yarn workspace @undefineds.co/linx dev

# 继续最近一次 thread
yarn workspace @undefineds.co/linx dev chat --continue

# 选择外部 agent backend 后进入 LinX auto-mode ACP 控制界面
yarn workspace @undefineds.co/linx dev --backend codex
yarn workspace @undefineds.co/linx dev --backend claude "先总结这个目录的职责"
yarn workspace @undefineds.co/linx dev --backend codebuddy -- --tools Read,Edit
yarn workspace @undefineds.co/linx dev --backend codex --auto
yarn workspace @undefineds.co/linx dev --list-backends
yarn workspace @undefineds.co/linx dev --sessions
yarn workspace @undefineds.co/linx dev --show <sessionId>
```

## Slash Commands

- `/help` 查看帮助
- `/threads` 查看最近 threads
- `/new` 新建 thread
- `/use <threadId>` 切换 thread
- `/model <modelId>` 切换模型
- `/exit` 退出

在 `linx --backend <backend>` 的 auto-mode ACP 控制界面中，LinX 只保留全局壳命令
（例如 `/login`、`/logout`、`/auto`、`/exit`）。`/help` 始终优先解释 LinX/Pi 壳层；
需要查看当前 backend adapter 暴露的命令时使用 `/commands`。其他 backend-owned slash
command 再交给当前 backend adapter 或 auto-mode shell 解释。

默认 LinX/Pi TUI 里的 `/symphony` 是 AI Secretary 的委派能力开关，不是 backend 命令：

- `/symphony` 或 `/symphony on` 让后续普通消息按 Symphony delegation 处理
- `/symphony status` 查看状态
- `/symphony off` 回到普通 Secretary chat

auto-mode ACP 控制界面当前提供这些 LinX 壳命令：

- `/help` 或 `/hotkeys` 查看 LinX keymap
- `/login` / `/logout` 刷新或清除 xPod/LinX/Solid 登录；AI provider key 不走 `/login`
- `/session` 查看当前 backend session、runtime、credential 和 cwd
- `/auto on|off|status` 切换或查看 Secretary 接管状态
- `/queue` 查看等待当前 turn 完成后的 steer / follow-up 队列
- `/model <modelId>` 请求当前 ACP backend 切换模型
- `/debug on|off` 切换协议调试输出
- `/exit` 或 `/quit` 结束控制界面

## Credentials

当前优先读取：

1. `~/.linx/config.json` + `~/.linx/secrets.json`

`~/.linx` 只保存 xPod/LinX/Solid 身份材料。AI provider credential 通过
`linx ai connect` 或 TUI credential repair 写入 Pod AI config。

AI provider 冒烟测试分两层：默认测试只验证 shell 输入通过 shared model/core
写入 Pod AI config，并验证 Codex-compatible provider 可被 runtime 读取；真实
OpenRouter 请求需要显式提供环境变量后单独运行：

```bash
LINX_OPENROUTER_SMOKE=1 OPENROUTER_API_KEY=sk-or-xxx node --test test/ai-connect-boundary-smoke.test.mjs
```

## Backend Control Notes

- Design contract: see [`docs/backend-pod-contract.md`](../../docs/backend-pod-contract.md)
- Auto/Symphony 行为契约见 [`docs/secretary/auto-symphony-contract.md`](../../docs/secretary/auto-symphony-contract.md)
- Symphony 是 AI Secretary 的内置委派能力，不是独立产品入口；控制面 MVP 见 [`docs/agent-collaboration-model.md`](../../docs/agent-collaboration-model.md)
- `--backend <backend>` 当前直接依赖本机已经安装好的 `codex` / `claude` / `codebuddy`
- 如果当前终端对全屏重绘支持不好，可加 `--plain`（等价于 `LINX_BACKEND_PLAIN=1`）关闭全屏 TUI，改用线性输出
- LinX 负责统一 `auto on/off` 接管开关，并把 backend 会话归档写到 `~/.linx/auto-mode/sessions/`
- `auto on` 表示由 AI Secretary 主驾当前 backend 会话，并在搞不定、越权或需要人类决策时再问用户；不等同于 Codex 原生 `approvalPolicy=never`；原生审批策略保留在 backend 自己的配置通道
- 进入默认是 `auto off`；可用 `--auto` 直接以接管状态启动，或进入后用 `/auto on|off|status` 切换和查看
- backend 凭据只从 Pod AI 配置读取；本地只保存 LinX/Solid auth，不提供 `credential-source` 选择
- `codex` backend 不要求 provider 名为 `openai`；可配置任意 Codex-compatible provider（例如 LiteLLM/DeepSeek/OpenRouter gateway），provider `baseUrl` 存在 Pod provider 资源上，API key 存在 Pod credential 资源上
- 单本地会话时，approval 主路径是在当前 backend 控制界面内直接处理；不会依赖额外的 approval inbox
- 默认人工审批同时支持当前本地 backend 控制界面和 Pod 远端控制面，谁先决策谁生效；低上下文的 CLI approval inbox 命令已移除，远端审批队列由 App/Inbox 承载
- 如果本地已 `linx login`，LinX 会把 pending approval 写进 Pod 的 `approval / audit / inbox_notification`，供 App/Inbox 读取和处理
- 当前是最小多轮版：本地 REPL、统一 ACP 会话、归档结构化事件
- 在交互式 TTY 里，`--backend ...` 使用 auto-mode ACP 控制界面；默认无 `--backend` 才进入 LinX/Pi TUI
- Slash command 只有一套截获入口；全局 LinX 命令由壳处理，其他命令交给当前 backend adapter，通用 TUI 层不写 Codex/Claude/CodeBuddy 专属逻辑
- `linx --show <sessionId>` 现在会回放归档 timeline，而不是直接输出 `session.json`
- `codex` 走 `codex-acp`，`claude` 走 `claude-code-acp`，`codebuddy` 走内置 `--acp --acp-transport stdio`
- 当前 `linx --backend codex` 只有 ACP 路径，前台是 auto-mode 控制界面，后端命令由 `codex-acp` 执行
- Codex 原生壳相关集成不放在 backend 控制界面里维护；后台桥接能力位于 `apps/cli/src/lib/codex-plugin/*`，按 plugin/sidecar 语义组织
- LinX 不再维护各家 native / 非 ACP JSON 输出兼容层，统一按 ACP 处理多轮会话、权限请求和结构化输入
- 仓库内 `yarn workspace @undefineds.co/linx dev --backend ...` 不再依赖 `tsx`，会直接编译并运行主 CLI 入口
- `--` 后面的参数会原样透传给对应后端 CLI
- 当前只支持 `local runtime + remote approval`；不支持本地 runtime 退出后由云端接管执行

## Symphony Control Plane

- TUI 里的 `/symphony on|off|status` 是主入口，像 `auto` 一样切换/查看 Secretary 的一项能力。
- `Symphony` 是 AI Secretary 的委派能力，不是记录浏览命名空间，也不是独立 CLI 产品入口；Session / Delivery / Issue 的查看应走通用 runtime/session 或 App 工作项界面。
- `Symphony` 不绑定从哪个 Chat/Thread 发起；在哪个界面触发只影响 UI 来源，不决定投递模型。
- Chat/Thread 是过程展示和回看载体，由 Secretary 在产品层创建或选择，并把对应 URI 写进 `Issue / Delivery / Session`；TUI 不要求用户填写这些 URI。
- `symphony` 调整的是 Secretary 的行为：Secretary 自己不主要下场写代码，而是引用通用 Task，创建 `Issue / Delivery / Session` 编排记录，把工作投影给下面的 backend worker。
- Objective 必须来自用户正常发送的聊天消息；`/symphony` 只切换能力，不把 slash 参数伪造成用户输入，也不直接创建一次性派活。
- 归档固定写在本地 LinX home 下的 `~/.linx/symphony/`，不新增单独的产品级 home 环境变量。
- 当前 MVP 不做 `linx symphony` / `linx-symphony` 独立产品入口、不做 daemon、不新增 Task/Delivery/Session Pod schema、不改 GUI/TUI 信息架构；新增 shared Pod resource 仍以 `@undefineds.co/models` 为权威。

## TODO

- blocked by xpod: cloud-hosted backend runtime
