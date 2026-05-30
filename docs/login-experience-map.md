# LinX 登录路径与部署配置

这份文档只描述产品入口、用户流程和验收口径，不再重复 IDP/SP 模型。
IDP/SP、`solid:storage`、Local canonical URL 和 tunnel 语义分别以
`docs/login-identity-storage-routing-model.md` 和
`docs/local-sp-domain-and-tunnel.md` 为准。

权威来源：

- IDP/SP、注册、`solid:storage`、业务写入：`docs/login-identity-storage-routing-model.md`
- Local canonical domain 策略、tunnel、localhost/LAN：`docs/local-sp-domain-and-tunnel.md`
- 多地址探测和 same-node 访问优化：`docs/multi-channel-access.md`

## 产品入口

LinX 普通登录卡展示三个产品入口：

| 入口 | 用户看到的选择 | 说明 |
| --- | --- | --- |
| Cloud | 托管空间 | 默认云端账号和数据空间。 |
| Local | 本机数据空间 | 数据空间在本机 xpod；身份和 storage 绑定规则见主文档。 |
| Standalone | 本机独立空间 | 账号、授权和数据都在本机 xpod；不走 Cloud provisioning。 |

次级入口：

| 路径 | 说明 |
| --- | --- |
| Custom | 第三方 Solid provider，一次填写一个 URL；作为“连接其他 Solid 账号”的次级入口。 |

规则：

- 具体的 OIDC issuer / Storage Provider 语义、Local canonical URL、tunnel 和访问渠道边界，见两份主文档。
- Custom 只让用户填写一个 Solid provider URL，不拆成两次选择。
- Local 是“当前本地节点/SP”的入口，不代表可以枚举同一个 Cloud IDP 下的所有 SP。未来其他本地/集群空间需要通过 membership/invite 进入列表。
- Local 的本机/LAN/tunnel 只是访问渠道，不是新的账号或 storage 语义。

## 用户流程

### Cloud

```text
选择 Cloud
  -> 跳转 Cloud 账号页
  -> 注册或登录
  -> Cloud 创建或选择 Cloud Pod
  -> 授权 LinX
  -> 回调进入 LinX
```

验收：不启动本地 xpod，Solid DB Pod URL 在 Cloud SP 下。

### Local

```text
选择 Local
  -> LinX 启动本地 xpod
  -> LinX 向 Cloud 注册 Local SP，拿到 selected canonical SP URL
  -> 可选配置 tunnel token 或 self-managed HTTPS origin
  -> 用户走 Cloud 登录 / 注册 / consent
  -> Cloud 将 WebID profile 的 solid:storage 绑定到 selected Local SP Pod
  -> 回调进入 LinX
```

验收：Cloud WebID 可以保持 `https://id.undefineds.co/...`，但 Solid DB Pod URL、首个业务写入、后续 update/delete 都必须在 selected Local SP Pod URL 下。

### Standalone

```text
选择 Standalone
  -> LinX 启动本地 xpod
  -> 打开本地账号页
  -> 注册或登录本地账号
  -> 创建本地 Pod / consent
  -> 回调进入 LinX
```

验收：不走 Cloud provisioning；WebID、issuer 和 storage 都在本地 xpod。

### Custom

```text
选择 Custom
  -> 输入第三方 Solid provider URL
  -> 跳转第三方 provider 登录 / consent
  -> 回调进入 LinX
```

验收：OIDC provider 和 Storage Provider 是同一个用户输入 URL；如果 profile storage 不在该 provider 下，阻断进入。

## 切换账号

```text
主界面账号入口
  -> 登出当前 session
  -> 回到入口选择
  -> 重新选择 Cloud / Local / Standalone / Custom
```

当前 MVP 仍以单账号恢复为主；多账号记忆和切换列表是后续增强。

## 实现验收口径

- Cloud：登录后 `storedAccount.storageProviderLabel` 为 `Cloud`，Pod URL 不依赖本机地址。
- Local：登录后 `storedAccount.storageProviderLabel` 为 `Local`，Solid DB Pod URL 必须以 selected Local SP canonical URL 开头。
- Local：`/.data/*` bootstrap、chat/message、inbox、Agent Home、runtime session ref、AI 配置、Secretary 初始化数据和内置 runtime API 都必须从 Solid DB 当前 Pod URL 推导。
- Local：不能从 Cloud WebID origin、issuer URL、profile URL、localhost 或 LAN 地址推导业务写入位置。
- Local：Cloud provision 回调创建 Pod 时，Local SP 必须创建 Pod root 和结构化 root metadata；`HEAD /<pod>/` 必须返回存在。
- Standalone：不要求公网 URL，不走 Cloud provisioning；必须能完成本机/局域网登录验证。
- Custom：只使用用户输入的 provider URL，不做 Cloud/Local 特例。

## 错误边界

- Local canonical URL 暂不可达时，可以启动本地 xpod 做本机/LAN 连通性检查，但不能把本机/LAN 地址写入 Cloud WebID profile，也不能自动降级成 Standalone。
- Local 缺少 SP-scoped provision、WebID profile 缺少 `solid:storage`、或 `solid:storage` 指向 Cloud/旧 Local 节点时，必须阻断进入。
- 隧道 token 缺失或失效只影响访问渠道；不能改变 selected SP 或 fallback 到 Cloud Pod。
- StorageConflict 的处理策略仍是阻断并提示用户返回正确空间或创建当前空间的新 Pod；MVP 不做静默迁移。

## 回归记录

- 2026-05-10 新增 Cloud IDP + Cloud SP 真实回归：`yarn workspace @linx/e2e test:real-cloud`。
- 2026-05-11 Cloud+Cloud 现网回归已通过：生产 Cloud 注册、授权、进入 `/chat`，且 Solid DB ready。
- 2026-05-11 Cloud IDP + Local SP 隧道路径已通过：`https://node-0000.undefineds.co/ -> localhost:5737`，使用 Cloudflare tunnel token。
- 2026-05-06 验证通过 Cloud IDP + Local SP 隧道路径：`https://prot-reprint-setup-civic.trycloudflare.com/ -> localhost:5737`。
