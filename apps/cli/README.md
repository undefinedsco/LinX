# LinX CLI

最小用户聊天 CLI，复用 LinX 的 Pod 数据模型和 xpod OpenAI-compatible API。

## Commands

```bash
# 列出远程可用模型
yarn workspace @linx/cli dev models

# 单轮聊天
yarn workspace @linx/cli dev chat "帮我总结一下今天的工作"

# 进入交互模式
yarn workspace @linx/cli dev chat

# 继续最近一次 thread
yarn workspace @linx/cli dev chat --continue
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
2. `~/.xpod/config.json` + `~/.xpod/secrets.json`

这样可以先复用现有 `xpod-cli` 的登录状态。
