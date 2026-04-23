# LinX CLI Login Flow

## 目标

LinX CLI 当前的登录目标是：

- 默认前端是 `linx` 命令进入的 Pi 原生 TUI
- 使用 LinX Cloud 的浏览器 OIDC / consent 流登录
- 登录态保存在本地 `~/.linx`
- 运行时优先复用已有登录态，避免每次重复打开浏览器

## 当前入口

### 交互模式

```bash
linx
```

这是默认入口。

行为：

1. 启动 Pi 原生 TUI
2. 若本地已有有效 LinX Cloud 登录态，直接复用
3. 若没有有效登录态，当前实现会在进入 TUI 前给出一个显式选项，询问是否现在打开浏览器登录
4. 用户确认后，拉起浏览器授权

### 显式登录

```bash
linx login
```

行为：

1. 优先尝试复用已有登录态
2. 如果已有登录态仍有效，直接返回成功
3. 如果没有登录态或旧登录态不可复用，则走浏览器授权

### 非交互模式

```bash
linx --print "..."
```

限制：

- `--print` 没有交互 UI
- 因此不能中途弹出授权选择器
- 所以必须提前有可复用的本地登录态

## 浏览器授权流程

当前实现使用：

- Authorization Code + PKCE
- loopback callback（本地 HTTP callback）

流程：

1. CLI 在本机启动临时 callback server
   - 默认类似 `http://127.0.0.1:<random-port>/auth/callback`
2. CLI 打开浏览器到：
   - `https://id.undefineds.co/.oidc/auth?...`
3. 浏览器完成登录 / consent
4. IdP 回跳本地 callback
5. CLI 接收 callback，完成 token exchange
6. CLI 将登录态持久化到本地

### 本地 callback 页面

浏览器最后看到的“LinX Cloud connected”页面是 **CLI 本地 callback server 返回的页面**，不是云端页面。

这是标准 CLI loopback 模式的一部分，不代表云端没参与授权。

## 本地持久化位置

当前会写入：

### 配置与 secrets

- `~/.linx/config.json`
- `~/.linx/secrets.json`
- `~/.linx/account.json`

### Inrupt OIDC storage

- `~/.linx/oidc-storage/`

## 当前本地凭据结构

`config.json`：

```json
{
  "url": "https://id.undefineds.co/",
  "webId": "https://id.undefineds.co/<name>/profile/card#me",
  "authType": "oidc_oauth"
}
```

`secrets.json`：

```json
{
  "oidcRefreshToken": "...",
  "oidcAccessToken": "...",
  "oidcExpiresAt": "...",
  "oidcClientId": "..."
}
```

## 复用策略

当前 CLI 侧的正确策略应是：

1. 若本地存在 `oidc_oauth`
2. 优先从 `~/.linx/oidc-storage/` 中恢复 Inrupt 已持久化的 OIDC session
3. 若 access token 即将过期或已过期，则使用该 session 上下文执行正式 refresh
4. 将新的：
   - `oidcAccessToken`
   - `oidcExpiresAt`
   - 如有 rotation 的 `oidcRefreshToken`
   回写到 `~/.linx/secrets.json`

这里的关键点是：

- `secrets.json` 只保存 token set
- `oidc-storage/` 保存 Inrupt 侧的 session/client registration/context

单纯只看 `secrets.json` 里的 access token 是否过期是不够的。

### 为什么不能只靠 `secrets.json`

如果只读本地 `oidcAccessToken`：

- token 过期后运行时就会直接失效
- 必须强迫用户重新浏览器登录

这不符合长期预期。

### 为什么也不能绕过 `oidc-storage`

之前联调里，直接调用不带 session 上下文的 refresh 路径，会触发：

- `Missing static client secret in storage`

这说明 refresh 不能只靠 `refreshToken + clientId` 的轻量本地猜测，而应复用 Inrupt 已经保存在 `oidc-storage` 的完整 session / client secret 上下文。

## TUI 运行时认证语义

Pi runtime 里的 `undefineds` provider 不是普通“让用户自己填 API key”的 provider。

当前语义是：

1. TUI / runtime 自身只需要 LinX Cloud 登录态
2. 对 cloud `/v1/models`、`/v1/chat/completions` 的请求使用 LinX OIDC access token
3. 用户自己的 OpenAI / Anthropic / 其他供应商 key 不应在 CLI 本地直接输入
4. 这些供应商凭据应由 Pod / cloud 侧管理与解析

## `/models` 语义

理想语义：

- `linx models`
- TUI 内部模型选择

都应该以 cloud `/v1/models` 为真相。

当前代码已经接上：

- `GET https://api.undefineds.co/v1/models`

但在联调期仍需注意：

- 如果 `/models` 失败，旧逻辑可能 fallback 到内置 catalog
- 这会造成“看起来像 cloud 模型，其实不是 live models”的假象

后续应进一步保证：

- CLI/TUI 模型列表默认不把 fallback 当成 cloud 真相

## 当前已知限制

### 1. 登录完成后的 WebID 仍是 identity WebID

当前保存到本地的 WebID 仍然类似：

```text
https://id.undefineds.co/<name>/profile/card#me
```

这表示：

- 浏览器授权成功
- 但 CLI 侧还没有进一步拿到“真实业务 Pod / storage 绑定后的最终上下文”

因此：

- 登录成功不等于 Pod 选择 / 业务上下文已经完全对齐

### 2. `--print` 仍然要求预先登录

因为它没有交互 UI，不能在中途完成浏览器授权。

### 3. 当前 loopback callback 页面仍是本地页面

这在技术上是合理的，但从产品一致性看，更专业的长期方案应由 xpod / cloud 提供 callback bridge。

## 长期方向

### CLI / TUI 侧

1. 进入 `linx` 后直接给出更清晰的登录选项
2. 登录成功后刷新模型列表与上下文，而不是用户手动重试
3. 将 token 过期检测和会话复用提示做得更明显

### Xpod / Cloud 侧

1. 给 CLI/TUI 明确提供授权完成路径
   - loopback callback 已可用
   - 后续可加 device code / callback bridge
2. 登录完成后提供稳定的账号 / Pod / WebID / storage 真相接口
3. `/v1/models` 与 cloud runtime 的 provider 凭据来源完全对齐

## 常见问题

### `linx login` 浏览器成功了，但本地卡住

这是 callback server / keep-alive / 本地连接关闭问题，不是授权页本身的问题。

### `linx login` 每次都重新弹浏览器

如果本地已有完整 OIDC session，应该优先复用并 refresh。

只有以下情况才应重新浏览器授权：

1. 本地没有任何可恢复 session
2. refresh token 已失效
3. 本地 `oidc-storage` 与 `secrets.json` 已损坏或无法对齐

### `linx login` 成功，但 `linx models` 仍异常

说明“浏览器授权成功”和“cloud runtime 真正可用”之间还存在后续问题，需要分别排查：

1. 本地 token 是否已保存
2. `/v1/models` 是否正常返回
3. cloud 是否已识别该身份并解析 Pod / provider 配置
