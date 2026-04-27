# LinX CLI

最小用户聊天 CLI，复用 LinX 的 Pod 数据模型和 LinX server 的 OpenAI-compatible API。

- cloud account/login 默认走 `https://id.undefineds.co/.account/*`
- cloud chat/models 走 live `https://api.undefineds.co/v1/*`
- 内置 discovery snapshot 只做离线 fallback，不替代 live `/v1/models`
- 官方云默认分流：`id` 负责 Solid/OIDC，`pods` 负责 Pod 托管域，`api` 负责 chat/models runtime；自建 Pod 默认仍走同源

## Commands

```bash
# 浏览器授权登录并保存本地 OIDC 会话
# 默认用官方 cloud identity：https://id.undefineds.co
yarn workspace @undefineds.co/linx dev login

# 自建 / 本地 issuer 时再显式覆盖
yarn workspace @undefineds.co/linx dev login --url http://localhost:3000

# 查看 / 清理当前本地登录态
yarn workspace @undefineds.co/linx dev whoami --verbose
yarn workspace @undefineds.co/linx dev logout

# 把云端 AI provider 凭据写进 Pod
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

# 本地 watch（多轮 REPL + 结构化留档）
yarn workspace @undefineds.co/linx dev watch run codex
yarn workspace @undefineds.co/linx dev watch run claude "先总结这个目录的职责"
yarn workspace @undefineds.co/linx dev watch run codebuddy -- --tools Read,Edit
yarn workspace @undefineds.co/linx dev watch backends
yarn workspace @undefineds.co/linx dev watch sessions
yarn workspace @undefineds.co/linx dev watch approvals
yarn workspace @undefineds.co/linx dev watch approve <approvalId> --session
yarn workspace @undefineds.co/linx dev watch reject <approvalId> --reason "unsafe command"
```

## Slash Commands

- `/help` 查看帮助
- `/threads` 查看最近 threads
- `/new` 新建 thread
- `/use <threadId>` 切换 thread
- `/model <modelId>` 切换模型
- `/exit` 退出

## Credentials

当前优先读取：

1. `~/.linx/config.json` + `~/.linx/secrets.json`

## Local Watch Notes

- `watch run` 当前直接依赖本机已经安装好的 `codex` / `claude` / `codebuddy`
- 如果当前终端对全屏重绘支持不好，可加 `--plain`（等价于 `LINX_WATCH_PLAIN=1`）关闭全屏 TUI，改用线性输出
- LinX 负责统一 `manual | smart | auto` 模式，并把会话元数据写到 `~/.linx/watch/sessions/`
- `--credential-source local|cloud|auto` 只决定凭据来源；`watch` 当前运行时始终是本地，不会因为选 cloud credential source 就切成 cloud runtime
- `--credential-source cloud` 当前可显式用于 `codex` / `claude` / `codebuddy`，前提是对应 API key 已写进 Pod
- 单本地会话时，approval 主路径是在当前 watch TUI 内直接处理；不会依赖额外的 approval inbox
- 默认人工审批同时支持当前本地 watch 和 Pod 远端控制面，谁先决策谁生效
- 如果本地已 `linx login`，LinX 会把 pending approval 写进 Pod 的 `approval / audit / inbox_notification`
- `linx watch approvals` / `approve` / `reject` 主要用于远端、后台或多会话场景的 approval inbox；不是本地单会话 watch 的主交互路径
- 当前是最小多轮版：本地 REPL、统一 ACP 会话、归档结构化事件
- 在交互式 TTY 里，`watch run` 会默认进入全屏 TUI；非 TTY / 管道输出会自动降级到 plain mode
- `linx watch show <sessionId>` 现在会回放归档 timeline，而不是直接输出 `session.json`
- `codex` 走 `codex-acp`，`claude` 走 `claude-code-acp`，`codebuddy` 走内置 `--acp --acp-transport stdio`
- 当前 `linx watch run codex` 的前台仍是 LinX watch TUI，不是 Codex 原生 TUI；真正执行任务与工具调用的是 `codex-acp`
- Codex 原生壳相关集成不放在 LinX watch 壳里维护；后台桥接能力位于 `apps/cli/src/lib/codex-plugin/*`，按 plugin/sidecar 语义组织
- LinX 不再维护各家 native / 非 ACP JSON 输出兼容层，统一按 ACP 处理多轮会话、权限请求和结构化输入
- 仓库内 `yarn workspace @undefineds.co/linx dev watch ...` 不再依赖 `tsx`，会直接编译并运行独立 watch 入口
- `--` 后面的参数会原样透传给对应后端 CLI
- 当前只支持 `local runtime + remote approval`；不支持本地 runtime 退出后由云端接管执行

## TODO

- blocked by xpod: `watch --runtime cloud`
