# LinX 登录路径与部署配置

## 产品边界

LinX 的登录路径由两个维度决定：

- `IDP`：账号、登录、OIDC consent、WebID 由哪里签发。
- `SP`：Pod 数据存在哪里，以及通过哪个 URL 被访问。

最终产品路径收敛为四类。用户侧最重要的感知是：`Local 是否先能启动使用`，以及 `SP 公网地址是否已经配置`。当前结论是：Cloud SP 域名由 Cloud 提供；Local SP 域名不由 LinX 自动生成。Local 即使没有公网域名或隧道，也必须先保证本机/局域网可用，后续再补公网 route。

| 编号 | 产品路径 | IDP | SP | SP 域名 / URL | 适用场景 |
| --- | --- | --- | --- | --- | --- |
| 1 | Cloud | Cloud | Cloud | Cloud SP 自动提供 | 账号和数据都托管在 Cloud |
| 2 | Local 基础 / LAN | Local 或 Cloud 后续绑定 | Local | 默认 `localhost` / LAN URL | 数据在本机，没有公网或隧道时也能先使用 |
| 3 | Local 公网直连 | Cloud | Local | 用户自己的公网 URL | 数据在本机，本机可被外网直连 |
| 4 | Local 隧道 / Standalone | Cloud 或 Local | Local | 用户自己的公网 URL / 隧道域名；Standalone 可留空 | 不可直连时用隧道；全套本地时用 Standalone |

重要规则：

- LinX 不再为 Local SP 自动分配 `node-*.undefineds.co`。
- `CSS_BASE_STORAGE_DOMAIN` 不再是 Local onboarding 的用户路径。
- Cloud IDP + Local SP 只要需要 Cloud 或外网访问 Local SP，SP URL 必须由用户自己提供。
- 用户不再填写“平台分配的 Local 公网域名”；因为这条产品路径已经下线。
- Local 默认自动路径不要求用户填写公网域名，只启动本机 xpod，默认保证本机/局域网可用。
- 如果用户没有公网域名，也不配置隧道，Local 仍然可以启动并本机/局域网使用；但这不等同于完成 Cloud IDP + Local SP 远程登录。
- 用户后来配置公网域名、直连入口或隧道后，可以把同一个 Local SP 升级为 Cloud 可访问 route；升级 route 不应该要求用户重建本地数据目录。
- Local 远程路径的 `publicUrl` 必须是用户实际可访问的 HTTPS origin；本机端口和公网入口可以不同，但 Pod URL、OIDC redirect 后的数据访问都以 `publicUrl` 为准。

---

## 1. Cloud：IDP + SP 全套 Cloud

```
LinX 选择 Cloud
  ↓ 点 Cloud
跳转 id.undefineds.co/.account/
  ↓ 注册或登录：username/email/password
  ↓ Cloud 创建或找到 Cloud Pod
  ↓ 用户授权 LinX 访问
回调到 LinX
  ↓
进入 Chat
```

数据位置：Cloud SP。

- LinX 不启动本地 xpod。
- 用户不需要配置数据目录、公网域名、隧道或本机端口。
- 这是默认推荐路径。
- SP URL 由 Cloud 自己提供，不进入 Local SP 域名配置。

---

## 2. Local 基础 / LAN：先保证本机和局域网可用

```
LinX 选择 Local
  ↓ 不填写公网域名，也不配置隧道
  ↓ LinX 启动本地 xpod，CSS_BASE_URL=http://localhost:5737/
  ↓ 打开本地账号页，或作为 Local 基础验证路径
回调到 LinX
  ↓
进入 Chat，数据写入本地 SP
```

配置要求：

- 不要求公网 URL。
- 不要求隧道 token。
- 默认本机可用；如果 `CSS_BASE_URL` 配成局域网 URL，LinX/xpod 内部开放监听，局域网访问仍取决于用户网络和防火墙。
- 用户只配置入口 URL；监听地址由 LinX/xpod 根据入口 URL 内部推导。
- 这条路径是 Local 供应商的自动路径，不能因为没有公网 IP 或没有隧道而阻断启动。
- 如果用户之后需要 Cloud IDP 或外网访问同一个 Local SP，再补充公网域名和 route 配置。

---

## 3. Local 直连：Cloud IDP + Local SP，外网可直连

```
LinX 选择 Local
  ↓ 用户选择远程可访问的 Local
  ↓ 用户提供自己的 SP 公网 URL，例如 https://pod.example.com/
  ↓ 用户确认本机入口可被外网直连
  ↓ LinX 启动本地 xpod，CSS_BASE_URL=https://pod.example.com/
  ↓ LinX 向 Cloud 注册 Local SP publicUrl
  ↓ 用户走 Cloud 登录 / consent
回调到 LinX
  ↓
进入 Chat，数据写入本地 SP
```

配置要求：

- 用户必须提供自己的公网域名或公网 URL。
- 用户负责 DNS、反向代理、防火墙、端口转发和 HTTPS 入口。
- LinX 不会把平台域名解析到用户外网 IP，也不会提供 `node-*.undefineds.co`。
- xpod 本地监听仍可在 `http://localhost:5737/`，但对外身份和 Pod URL 使用用户提供的 URL。
- 这条路径使用 Cloud IDP 登录，但数据写入用户本机 Local SP。

---

## 3. Local 隧道：Cloud IDP + Local SP，外网不可直连

```
LinX 选择 Local
  ↓ 用户选择远程可访问的 Local
  ↓ 用户提供自己的 SP 公网 URL 或隧道域名，例如 https://pod.example.com/
  ↓ 用户配置隧道供应商和 token
  ↓ 用户把自己的域名接到隧道出口
  ↓ LinX 启动本地 xpod 和隧道客户端
  ↓ LinX 向 Cloud 注册 Local SP publicUrl
  ↓ 用户走 Cloud 登录 / consent
回调到 LinX
  ↓
进入 Chat，数据写入本地 SP
```

配置要求：

- 用户必须提供自己的公网域名或隧道域名。
- 用户负责按隧道供应商要求完成 DNS、证书和出口绑定。
- LinX 只保存并使用用户提供的 `publicUrl`，不会提供统一转发域名。
- 如果没有公网域名，不能走 Cloud IDP + Local SP 远程路径；应先走 Standalone 或 Local 本机验证。
- 隧道供应商如果能稳定分配 HTTPS 域名，可以直接使用供应商分配的域名；否则用户需要购买或配置自己的域名。

---

## 4. Standalone：IDP + SP 全套 Local

```
LinX 选择 Standalone，或 Local 默认自动路径
  ↓ LinX 启动本地 xpod
  ↓ 打开本地账号页，例如 http://localhost:5737/.account/
  ↓ 用户注册或登录本地账号
  ↓ 创建 Pod / consent
回调到 LinX
  ↓
进入 Chat，数据写入本地 SP
```

规则：

- 不需要公网 URL。
- 默认只承诺本机可用；局域网访问由用户网络环境决定，可以作为没有域名时的验证路径。
- 如果用户后来需要公网访问，仍由用户自己提供公网域名和网络入口。
- 如果用户后来需要 Cloud IDP 访问这个 Local SP，必须切到 Local 直连或 Local 隧道 route，并补充用户自己的公网 URL。
- 这条路径的 WebID 由本地 xpod 签发，和 Cloud WebID 不是同一个身份。

---

## 已登录用户切换账号

```
LinX 主界面
  ↓ 点头像或设置里的账号入口
  ↓ 登出当前 session
  ↓ 回到登录入口
  ↓ 用户选择 Cloud / Local / Standalone
  ↓ 重新走对应路径
```

当前 MVP 仍以单账号恢复为主；多账号记忆和切换列表是后续增强。

---

## 配置字段边界

## 实现验收口径

- Cloud 路径：不启动本地 xpod，登录后 `storedAccount.providerLabel` 为 `Cloud`，Pod URL 不依赖本机地址。
- Local 直连 / 隧道路径：启动本地 xpod，向 Cloud 注册用户提供的 `publicUrl`，Cloud 登录后 `storedAccount.providerLabel` 为 `Local`，Solid DB 的 Pod URL 必须以该 `publicUrl` 开头。
- Local 直连 / 隧道路径：登录完成只代表身份授权完成；验收还必须证明第一个业务写入和后续所有业务写入都落在所选 Local SP。`/.data/*` bootstrap、chat/message、inbox、Agent Home、runtime session ref、AI 配置、Secretary 初始化数据和内置 runtime API 都必须从 Solid DB 当前 Pod URL 推导，不能从 Cloud WebID origin、issuer URL 或 profile URL 推导。
- Local 直连 / 隧道路径：新增、更新、删除都按同一规则验收；如果当前 Solid DB 没有可确认的 Pod URL，业务写入必须失败，不允许静默回退到 WebID 所在的 Cloud。
- Local 直连 / 隧道路径：后续 update/delete 如果拿到的是绝对资源 IRI，该 IRI 必须位于当前 Solid DB Pod URL 前缀下；旧 Cloud 空间或旧 Local 节点的缓存 IRI 不能继续作为当前会话写目标。
- Local 直连 / 隧道路径：Cloud provision 回调创建 Pod 时，Local SP 必须同时创建文件目录和结构化 root metadata；`HEAD /<pod>/` 必须返回存在，不能让前端自己创建顶层 Pod root。
- Local 基础 / LAN：不要求公网 URL，不要求隧道；必须能启动本地 xpod 并完成本机登录验证。
- Standalone：不要求公网 URL，不走 Cloud provisioning；只承诺本机/局域网验证。

现网回归记录：

- 2026-05-10 新增 Cloud IDP + Cloud SP 真实回归：`yarn workspace @linx/e2e test:real-cloud`。
- 该回归要求 Cloud 注册页必须收集 `Username`，注册后二阶段必须能从 Cloud account controls 进入 Pod 创建；如果出现 `Pod creation endpoint not found` 或 consent 页没有 WebID 但 account 页没有 Pod 创建入口，测试会立即失败。
- 2026-05-11 Cloud+Cloud 现网回归已通过：生产 Cloud 注册、授权、进入 `/chat`，且 Solid DB ready。
- 2026-05-11 Cloud IDP + Local SP 隧道路径已通过：`https://node-0000.undefineds.co/ -> localhost:5737`，使用用户提供的 Cloudflare tunnel token。
- 2026-05-06 验证通过 Cloud IDP + Local SP 隧道路径：`https://prot-reprint-setup-civic.trycloudflare.com/ -> localhost:5737`。
- 验证结果：生产 Cloud 注册/consent 成功，Local SP 创建 Pod root，子容器创建成功，Solid DB ready，最终进入 `/chat`。

---

## 配置字段边界

### `CSS_BASE_STORAGE_DOMAIN`

`CSS_BASE_STORAGE_DOMAIN` 不再暴露为 Local onboarding 的用户配置项，也不用于生成用户可感知的 Local SP 域名。

如果 xpod/cloud 内部仍保留这个变量，只能作为服务端兼容或内部实现细节，不属于 LinX 登录路径产品配置。

### `publicUrl` / `publicDomain`

`publicUrl` / `publicDomain` 只表示用户自己的公网入口：

- Local 直连：必填。
- Local 隧道：必填。
- Standalone：可选；不填则使用 `localhost`。
- Cloud：不填。
- Local 基础 / LAN：不填。

### `domainSource`

当前只允许 `manual`。旧的 `cloud` / `undefineds` / `node-*.undefineds.co` 自动域名路径已下线。

---

## 错误边界

### Local remote-ready 缺少公网 URL

直接阻断启动并提示：

> Local 远程访问需要先配置用户自己的公网域名或隧道域名。

用户可以先走 Local 基础 / LAN 或 Standalone，本机验证不需要公网 URL。后续补齐公网 URL 和 route 后，再切到 Cloud IDP + Local SP。

### Local 隧道缺少域名

阻断保存配置并提示用户先准备公网域名。

### Local 隧道缺少 token

阻断保存配置；如果本机已有同供应商 token，可以沿用但不回显明文。

### StorageConflict

同源 provider 下，如果 WebID 的 `solid:storage` 指向的 SP 与当前登录入口不一致，阻断进入并提示用户回到正确空间或创建新 Pod。MVP 不做静默迁移。

Cloud IDP + Local SP 也是 split 路径，但 WebID profile 里的 `solid:storage` 仍然必须指向当前 Local SP。`provisionCode` 和 SP-scoped consent 只负责限制候选 Pod，不能作为跳过 profile/storage 校验的理由。如果 Cloud profile 仍指向 Cloud、旧节点，或缺少 `solid:storage` 绑定，必须阻断进入，避免后续业务数据写到错误空间。
