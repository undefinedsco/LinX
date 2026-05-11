# 本地 Pod 部署设计

> 状态：已收敛。历史版本里的 `pods.undefineds.co` / `node-*.undefineds.co` 自动分配 Local SP 域名方案已废弃。

当前权威文档：

- `docs/login-experience-map.md`：登录路径和部署配置边界。
- `docs/local-sp-domain-and-tunnel.md`：Local SP 域名与隧道规则。

## 当前产品路线

| 路线 | IDP | SP | SP 公网 URL |
| --- | --- | --- | --- |
| Cloud | Cloud | Cloud | 平台提供 |
| Local 直连 | Cloud | Local | 用户提供 |
| Local 隧道 | Cloud | Local | 用户提供 |
| Standalone / Local device-only | Local | Local | 可选，用户提供 |

## 本地 Pod 配置规则

- LinX 不再为 Local SP 自动分配平台域名。
- 用户不再手填平台生成的 Local 公网域名。
- `CSS_BASE_STORAGE_DOMAIN` 不再是 Local onboarding 的用户配置项。
- Local 默认自动路径只保证本机/局域网可用，不要求公网域名。
- Local 直连需要用户自己的公网域名，并由用户完成 DNS、端口转发、反向代理和 HTTPS 入口。
- Local 隧道需要用户自己的公网域名，并由用户把域名接到隧道出口。
- Standalone / Local device-only 默认使用 `http://localhost:5737/`，只承诺本机可用；局域网和公网访问由用户自行配置。

## LinX 与 xpod 分工

LinX 负责：

- 采集数据目录、端口、部署模式、用户公网域名、隧道供应商和 token。
- 启动或停止本地 xpod。
- 将用户提供的 public URL 写入 xpod 配置。
- 在 Cloud IDP + Local SP 路径下，把用户提供的 public URL 注册给 Cloud。

xpod 负责：

- 本地 IDP/SP 能力。
- Pod 创建、登录、consent 和数据持久化。
- 按 `CSS_BASE_URL` 生成 WebID、OIDC issuer 和 storage URL。

Cloud 负责：

- Cloud 路径的账号、登录、consent 和 Cloud SP。
- Local 路径的 Cloud IDP 登录和 Local SP provisioning。
- 不负责为 Local SP 分配或转发用户可感知的公网域名。
