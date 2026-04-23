# OIDC Runtime Token Refresh Fix

## 问题结论

当前 LinX CLI 浏览器登录链路已经能拿到并持久化 OIDC 登录态，但后续访问 cloud runtime API（如 `/v1/models`）时，会直接使用本地保存的 `oidcAccessToken`。

联调中实际失败现象：

- 请求：`GET https://api.undefineds.co/v1/models`
- 返回：`401 Unauthorized`
- 响应体：
  ```json
  {"error":"Unauthorized","message":"Invalid Solid token"}
  ```

进一步验证同一颗 token：

- 使用本地 `@solid/access-token-verifier` 复验，明确报：
  ```text
  JWTExpired: "exp" claim timestamp check failed
  ```

因此，这里的真实问题不是：

- `api.undefineds.co` 不可达
- runtime URL 拼错
- xpod 不接受用户 token

而是：

- **CLI 在调用 runtime API 前，没有对已过期的 `oidcAccessToken` 执行 refresh**

## 已验证事实

### 1. runtime 域名可访问

在开发机上实际验证：

- `api.undefineds.co` 可解析
- 直接访问 `https://api.undefineds.co/v1/models` 有响应
- 未鉴权时返回：
  ```json
  {"error":"Unauthorized","message":"Authentication required"}
  ```

这说明域名和服务本身在线。

### 2. WebID / issuer 关系正确

`https://id.undefineds.co/ganbb/profile/card#me` 对应 profile 中包含：

- `solid:oidcIssuer https://id.undefineds.co/`

因此 token 被拒绝并不是因为 WebID profile 的 `oidcIssuer` 三元组缺失或错误。

### 3. 本地保存的 access token 已过期

本机 `~/.linx/secrets.json` 中保存了：

- `oidcRefreshToken`
- `oidcAccessToken`
- `oidcExpiresAt`

实际解码后可见：

- `aud = "solid"`
- `iss = "https://id.undefineds.co/"`
- `webid = "https://id.undefineds.co/ganbb/profile/card#me"`
- 但 `exp` 已早于当前时间

所以 runtime 请求失败的直接原因是：

- **过期 token 被继续使用**

## 责任边界

这个问题应在 `linx-cli` 修，而不是优先在 `xpod` 修。

原因：

1. 登录态由 CLI 自己保存在 `~/.linx`
2. CLI 自己决定何时读 token、何时发 `/v1/models`
3. token 是否过期、是否 refresh，本质上是客户端 session lifecycle 管理问题

## 正确行为

CLI 应实现统一的 OIDC session helper：

1. 读取本地登录态
2. 判断 `oidcExpiresAt` 是否已过期或即将过期
3. 若快过期，使用 `oidcRefreshToken` 向：
   - `https://id.undefineds.co/.oidc/token`
   执行 refresh token grant
4. 拿到新的：
   - `access_token`
   - `expires_in`
   - 如有 rotation，则新的 `refresh_token`
5. 回写本地 `~/.linx/secrets.json`
6. 再带新 token 去请求：
   - `https://api.undefineds.co/v1/models`
   - `https://api.undefineds.co/v1/chat/completions`

## 建议实现结构

建议抽出一个统一 helper，而不是每个命令自己读 `secrets.json`：

- `loadOidcSession()`
- `isOidcAccessTokenExpiring()`
- `refreshOidcSessionIfNeeded()`
- `getValidAccessToken()`

然后：

- `linx models`
- TUI runtime 初始化
- `/v1/chat/completions` 调用前

全部统一走 `getValidAccessToken()`。

## 刷新判断建议

不要等完全过期才刷新，建议保守一点，例如：

- 若 `expiresAt <= now + 60s`
- 则执行 refresh

避免边界时钟漂移导致请求过程中刚好过期。

## refresh 失败时的用户提示

如果 refresh 失败：

- 不要继续报：`Invalid Solid token`
- 应明确提示：
  - 登录态已过期或刷新失败
  - 请重新执行浏览器登录

例如：

```text
Your LinX Cloud session has expired and could not be refreshed.
Please run `linx login` again.
```

## 不建议的做法

1. 不要把 runtime 问题继续归因成 DNS 问题
2. 不要在 token 过期后继续盲打 `/v1/models`
3. 不要把“refresh 失败”和“未鉴权”混成同一个错误

## 一句话总结

当前 LinX CLI 登录后保存了 refresh token，但在访问 runtime API 前没有自动刷新已过期的 access token，这是导致 `/v1/models` 返回 `Invalid Solid token` 的直接原因。
