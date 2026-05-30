# LinX Service

LinX Service 是本地常驻服务壳，负责启动 xpod、提供 LinX Web UI、暴露系统托盘和最小状态 API。登录、注册、WebID、`solid:storage` 和 Local canonical URL 语义不在这里定义。

权威文档：

- `docs/login-identity-storage-routing-model.md` - IDP/SP、注册、`solid:storage`、业务写入边界。
- `docs/local-sp-domain-and-tunnel.md` - Local canonical URL、canonical domain 策略、localhost/LAN/tunnel。
- `docs/multi-channel-access.md` - same-node route 探测和访问渠道优化。

## 路线

| 路线 | OIDC issuer | Storage Provider | Service 责任 |
| --- | --- | --- | --- |
| Cloud | Cloud | Cloud | 不启动本地 xpod。 |
| Local + Cloud-managed canonical domain | Cloud | Local xpod | 调 Cloud provisioning，拿 canonical `node-*.undefineds.co`，启动 xpod。 |
| Local + user-managed canonical domain | Cloud | Local xpod | 使用用户自有 HTTPS origin 调 Cloud provisioning，启动 xpod。 |
| Standalone | Local xpod | Local xpod | 启动全本地 xpod，不走 Cloud provisioning。 |

Local 默认由 Cloud 分配 canonical domain。用户不需要填写平台生成的 `node-*.undefineds.co`；Cloud provisioning 返回 canonical SP URL 后，Service 写入 `CSS_BASE_URL`。

## 配置

配置存储在：

- macOS: `~/Library/Application Support/LinX/.env`
- Windows: `%APPDATA%/LinX/.env`
- Linux: `~/.config/linx/.env`

核心 env：

```text
CSS_PORT=5737
CSS_BASE_URL=https://node-0000.undefineds.co
CSS_ROOT_FILE_PATH=/path/to/pod
CSS_SPARQL_ENDPOINT=sqlite:/path/to/quadstore.sqlite
CSS_IDENTITY_DB_URL=sqlite:/path/to/identity.sqlite
oidcIssuer=https://id.undefineds.co
XPOD_NODE_ID=...
XPOD_NODE_TOKEN=...
XPOD_SERVICE_TOKEN=...
LINX_PROVISION_CODE=...
```

`oidcIssuer` 是 xpod/CSS 组件配置的 canonical key。不要重新引入 `CSS_IDP_URL`、`XPOD_OIDC_ISSUER` 或 `idpUrl`。

## API

- `GET /api/setup/config` - 读取当前本地配置。
- `POST /api/setup` - 写入 `.env`；Local 会先完成 Cloud provisioning。
- `GET /api/service/status` - 返回 xpod 运行状态和 provisioning 信息。
- `POST /api/service/start` - 启动本地 xpod。
- `POST /api/service/stop` - 停止本地 xpod。
- `POST /api/service/restart` - 重启本地 xpod。

## 开发

```bash
yarn install
yarn build:service
yarn build:web
yarn start:service
```

## 端口

- `5173` - Web UI
- `5199` - 设置向导
- `5737` - xpod / Solid Pod
