# Local SP 域名与隧道说明

这份文档说明 LinX 在 `local` 和 `standalone` 两种部署模式下，SP URL 如何确定，以及用户什么时候需要自己准备公网域名和隧道。

## 结论

- `cloud`：IDP 和 SP 都在 Cloud，用户不配置 Local SP 域名。
- `local`：IDP 使用 Cloud，SP 运行在本机。要完成登录必须有用户自己的公网 HTTPS URL；缺少 URL 时只做本机/LAN 连通性检查，不静默降级。
- `standalone`：IDP 和 SP 都在本机；默认只保证本机/局域网可用，公网 URL 可选。
- LinX 不再为 Local SP 自动分配 `node-*.undefineds.co`，也不再要求用户手填平台生成的公网域名。
- `CSS_BASE_STORAGE_DOMAIN` 不再是用户可配置的 Local 登录路径。
- Standalone 默认自动路径是本机/LAN：启动本机 xpod，不要求公网 URL，不要求隧道 token。
- Local 远程路径的公网 URL 必须是用户真实可访问的 HTTPS origin。LinX 只使用这个 URL 注册 Local SP，不提供中间转发域名。
- 用户后续补充公网域名、直连入口或隧道后，可以把同一个 Local SP 切换为 Cloud/外网可访问 route；切换 route 不应要求重建本地数据目录。

## 1. 全套 Cloud

这是最简单的路径。

- `IDP` 使用 Cloud。
- `SP` 使用 Cloud。
- 用户只需要登录 `id.undefineds.co`。
- 数据存储在 Cloud SP。
- 本地不启动 Local SP，不需要本机域名、隧道或公网 IP。
- SP 域名由 Cloud SP 自己提供，不属于 Local SP 域名配置。

## 2. Local 本机 / 局域网基础路径

这是用户没有公网域名、没有公网 IP 或暂时不配置隧道时的完整本地登录路径，对应 Standalone。

用户需要准备：

- 一个本机数据目录。
- 可选的局域网访问环境。

LinX 行为：

- 不要求填写公网域名。
- 不要求选择隧道供应商。
- 不因为公网 IP 检测失败而阻断 Local 启动。
- xpod 默认监听本机端口，例如 `http://localhost:5737/`。
- 如果 `CSS_BASE_URL` 配成局域网地址，例如 `http://192.168.1.10:5737/`，LinX/xpod 内部开放监听；用户不需要也不应该再填写单独的 listen host 字段。
- 用户之后需要 Cloud IDP 或外网访问时，再选择 Local 并补充公网 URL 和 route 配置。

## 3. Cloud IDP + Local SP，外网可直连

这是用户希望身份在 Cloud、数据存在本机，并且本机有可被外网访问入口的路径。

用户需要准备：

- 一个自己控制的公网域名，例如 `pod.example.com`。
- 让该域名解析到本机可访问的公网地址。
- 本机网络、防火墙、端口转发或反向代理配置正确。

LinX 行为：

- 用户在 Local 远程配置里填写自己的公网 URL。
- LinX 用这个 URL 向 Cloud 注册 Local SP，例如 `publicUrl=https://pod.example.com/`。
- xpod 本地仍监听本机端口，例如 `http://localhost:5737/`。
- `CSS_BASE_URL` 使用用户提供的 URL，例如 `https://pod.example.com/`。
- `CSS_BASE_URL` 是身份和 Pod 的对外入口 URL，不是裸监听地址；监听地址由 LinX/xpod 根据入口 URL 内部推导。
- Cloud 不分配 Local SP 域名，也不把平台域名指向用户 IP。

## 4. Cloud IDP + Local SP，外网不可直连，用隧道

这是本机在 NAT、家庭宽带、内网或防火墙后面的路径。

用户需要准备：

- 一个自己控制的公网域名，或隧道供应商稳定分配的 HTTPS 域名，例如 `pod.example.com`。
- 一个隧道服务，例如 Cloudflare Tunnel、Sakura FRP 或其他可稳定暴露本地服务的供应商。
- 将自己的域名按隧道供应商要求接到隧道出口。
- 在 LinX 中填写公网域名、隧道供应商和 token。

LinX 行为：

- LinX 仍然只使用用户填写的公网 URL 注册 Local SP。
- LinX 不会把 `node-*.undefineds.co` 转发到用户隧道。
- 隧道域名的 DNS、证书、出口绑定由用户或隧道供应商负责。
- 如果用户没有公网域名，不能完成 Cloud IDP + Local SP；可以先使用 Standalone，或只做 Local 本机/LAN 连通性检查。

## 5. 全套 Local / Standalone

这是 IDP 和 SP 都在本机的路径。

- 默认只保证本机可用，例如 `http://localhost:5737/`。
- 局域网访问可以由用户自行暴露局域网地址。
- 公网访问是可选项；如果要公网访问，用户仍需要自己准备公网域名；不可直连时还需要隧道。
- 不经过 Cloud IDP，不需要 Cloud provisioning。
- WebID 由本地 xpod 签发，和 Cloud WebID 分离。

## 用户侧判断

用户只需要判断一个问题：

> 我是否需要让本机 SP 被当前设备之外的地方访问？

- 不需要 Cloud IDP：选 Standalone，不填公网域名，只在本机/局域网使用。
- 只想先完成本机登录：选 Standalone，不填公网域名，只在本机/局域网使用。
- 需要 Cloud IDP，而且本机外网可直连：选 Local 远程路径，填自己的公网 URL。
- 需要 Cloud IDP，但本机外网不可直连：选 Local 远程路径，填自己的公网 URL，并配置隧道。
- 不想用 Cloud 身份：选 standalone；是否公网可访问仍由用户自己的网络和域名决定。

## 产品文案建议

- `cloud`：`账号和数据都由 LinX Cloud 托管。`
- `local`：`Cloud 账号，数据存在本机；需要你自己的公网域名或隧道域名。`
- `local` 公网：`如需 Cloud 登录访问本机数据，请填写你自己的公网域名或隧道域名。`
- `standalone`：`账号和数据都在本机；公网访问需要你自己的域名和网络入口。`

## 验收要求

- Local 直连和 Local 隧道都必须用用户提供的 `publicUrl` 作为 Pod URL。
- Cloud 回调 Local SP 创建 Pod 时，Local SP 必须创建 Pod 目录和结构化 root metadata，确保 `HEAD /<pod>/` 返回存在。
- 如果 `publicUrl` 缺失，不能完成 Cloud IDP + Local SP；但必须允许用户先启动本机 xpod 做连通性检查，或选择 Standalone 完整登录。
- 现网回归需要至少验证一次真实 Cloud + 用户提供隧道 URL，确认登录后进入 `/chat` 且 Solid DB ready。
