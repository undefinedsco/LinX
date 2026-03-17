# LinX CLI

最小用户聊天 CLI，复用 LinX 的 Pod 数据模型和 LinX server 的 OpenAI-compatible API。

- cloud account/login 默认走 `https://id.undefineds.co/.account/*`
- cloud chat/models 走 live `https://api.undefineds.co/v1/*`
- 内置 discovery snapshot 只做离线 fallback，不替代 live `/v1/models`
- 官方云默认分流：`id` 负责 Solid/OIDC，`pods` 负责 Pod 托管域，`api` 负责 chat/models runtime；自建 Pod 默认仍走同源

## Commands

```bash
# 登录并创建本地 client credentials
# 默认用官方 cloud identity：https://id.undefineds.co
yarn workspace @linx/cli dev login --email you@example.com

# 自建 / 本地 Pod 时再显式覆盖
yarn workspace @linx/cli dev login --url http://localhost:3000 --email you@example.com

# 查看 / 清理当前本地登录态
yarn workspace @linx/cli dev whoami --verbose
yarn workspace @linx/cli dev logout

# 把云端 AI provider 凭据写进 Pod
yarn workspace @linx/cli dev ai connect claude --api-key sk-ant-xxx --model claude-sonnet-4-20250514
yarn workspace @linx/cli dev ai status claude
yarn workspace @linx/cli dev ai disconnect claude

# 列出远程可用模型
yarn workspace @linx/cli dev models

# 单轮聊天
yarn workspace @linx/cli dev chat "帮我总结一下今天的工作"

# 进入交互模式
yarn workspace @linx/cli dev chat

# 继续最近一次 thread
yarn workspace @linx/cli dev chat --continue

# 本地 watch（多轮 REPL + 结构化留档）
yarn workspace @linx/cli dev watch run codex
yarn workspace @linx/cli dev watch run claude "先总结这个目录的职责"
yarn workspace @linx/cli dev watch run codebuddy -- --tools Read,Edit
yarn workspace @linx/cli dev watch backends
yarn workspace @linx/cli dev watch sessions
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
- LinX 负责统一 `manual | smart | auto` 模式，并把会话元数据写到 `~/.linx/watch/sessions/`
- `--credential-source local|cloud|auto` 只决定凭据来源；`watch` 当前运行时始终是本地
- `--credential-source cloud` 当前可显式用于 `codex` / `claude` / `codebuddy`，前提是对应 API key 已写进 Pod
- 当前是最小多轮版：本地 REPL、读取 JSON/JSONL 输出、归档结构化事件
- `codex` 走常驻 `app-server`；`claude` / `codebuddy` 走原生 `--print --output-format stream-json`，每轮自动续用后端 session
- `claude` / `codebuddy` 的 `stream-json` 路径要求同时带上 `--verbose`
- 仓库内 `yarn workspace @linx/cli dev watch ...` 不再依赖 `tsx`，会直接编译并运行独立 watch 入口
- `--` 后面的参数会原样透传给对应后端 CLI

## TODO

- future: `watch --runtime cloud`
- unresolved: remote workspace mounting / file transport
- unresolved: remote tool approval protocol and ownership model
- unresolved: session lifecycle between local CLI and cloud executor
