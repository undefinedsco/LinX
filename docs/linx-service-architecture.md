# LinX Service Architecture

本文描述 `apps/service` 的进程外壳、Web UI 承载和本地 xpod 启动职责，
不定义登录、注册或 storage 语义。

权威来源：

- IDP/SP、注册、`solid:storage`、业务写入：`docs/login-identity-storage-routing-model.md`
- Local canonical URL、canonical domain 策略、tunnel、localhost/LAN：`docs/local-sp-domain-and-tunnel.md`
- 登录产品流程和验收：`docs/login-experience-map.md`

## Service 职责

LinX Service 是一个常驻后台进程。它可以同时承载 LinX Web UI 和本机
xpod runtime，但是否启动 xpod 取决于用户选择的 provider route。

| Route | 是否启动 xpod | Service 责任 |
| --- | --- | --- |
| Cloud | 否 | 提供 Web UI，不创建本地 xpod。 |
| Local | 是 | 启动本地 xpod，调用 Cloud provisioning，并写入主文档要求的 canonical xpod URL。 |
| Standalone | 是 | 启动本地 xpod，不调用 Cloud provisioning。 |
| Custom | 否 | 提供 Web UI，用户填写的第三方 Solid provider 自行处理登录和存储。 |

Service 不把本地 xpod 设为唯一默认 provider，也不跳过 provider 选择。
用户仍然通过 Cloud / Local / Standalone / Custom 选择空间。

## Architecture

```text
LinX Service
  ├─ Web Server
  │   └─ serves LinX Web UI
  ├─ xpod launcher
  │   ├─ starts local xpod for Local / Standalone
  │   ├─ writes generated env
  │   └─ reports status and provisioning facts
  ├─ Tunnel launcher
  │   └─ optional access channel, not storage identity
  └─ Status API
      └─ exposes service/xpod/provisioning state to Web UI
```

## Local Provisioning

For Local, Service generates xpod env from the selected storage route. The
identity/storage meaning is defined only in `docs/login-identity-storage-routing-model.md`.
Local has one product space type; the Cloud request may still carry a canonical
domain strategy:

- Cloud-managed canonical domain: call Cloud `/provision/nodes` with
  `domainMode=managed`, then use the returned canonical `publicUrl` as
  `CSS_BASE_URL`.
- User-managed canonical domain: call Cloud `/provision/nodes` with
  `domainMode=self-managed` and the user-provided HTTPS origin, then use that
  origin as `CSS_BASE_URL`.
- Standalone: do not call Cloud provisioning and do not set external
  `oidcIssuer` unless an explicit advanced configuration says so.

Important boundaries:

- `oidcIssuer` is the only xpod/CSS shorthand for an external issuer.
- Do not reintroduce `idpUrl`, `CSS_IDP_URL`, `XPOD_OIDC_ISSUER`, or
  `CSS_OIDC_ISSUER`.
- `localhost`, LAN URLs, and tunnel endpoints are access channels. They are not
  written to Cloud WebID `solid:storage` for Local unless they are explicitly
  the selected canonical SP URL in Standalone.
- Service status may expose workers/runtime counts for operator visibility, but
  those counts do not affect login semantics.

## UI Contract

The Web UI uses Service APIs only for startup/status:

- `/api/service/status` reports xpod running state, readiness, provisioning
  facts, current base URL, route status, and worker/runtime status.
- `/api/service/start` may start Local or Standalone xpod based on the selected
  provider route.
- The UI must still run normal Solid/OIDC login flow after xpod is ready.
- Consent/Pod selection is scoped by the selected SP as defined in
  `docs/login-identity-storage-routing-model.md`.

## Non-goals

- No separate Service-only login model.
- No hidden fallback from Local to Standalone.
- No claim that `localhost:5737` is the selected Local storage URL when Local is
  Cloud account authority + Local SP.
- No provider picker that blindly lists Cloud Pods while the selected route is
  Local.
