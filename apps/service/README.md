# LinX Service

LinX Service 是一个常驻后台的统一服务，基于 xpod V2 架构，包含：

- **xpod** - Solid Pod 服务器（本地存储）
- **Web Server** - LinX Web UI
- **System Tray** - 系统托盘

默认通过 npm 依赖直接内置并启动 xpod（`@undefineds.co/xpod`），不再要求本地额外 checkout xpod 仓库。

## 部署模式

基于 xpod V2 架构，支持三类用户路径：

| 路径 | IDP | SP | 公网 URL |
| --- | --- | --- | --- |
| Cloud | Cloud | Cloud | Cloud SP 自动提供 |
| Local | Cloud | Local | 远程访问时由用户提供；默认本机/局域网不需要 |
| Standalone | Local | Local | 可选，用户提供 |

### Local（推荐）

使用 Cloud 身份服务，本地运行 SP：

- **WebID**: `https://id.undefineds.co/你的用户名/profile/card#me`（永久稳定）
- **SP**: 运行在本地
- **公网地址**:
  - 默认自动路径不要求公网地址，只保证本机/局域网可用
  - 需要远程访问时，用户提供自己的公网 URL
  - 外网不可直连时，用户提供自己的公网 URL 并配置隧道
- **数据**: 存储在本地，平台不接触原始数据

适合：普通用户，希望使用 cloud 身份，同时尽量简化本地部署

### Standalone

完全本地自管身份与 SP：

- **域名**: 用户自己管理（如 `pod.alice.com`）
- **身份**: 本地自管
- **数据**: 完全自主

适合：企业用户，有自己的域名和基础设施

## 开发

```bash
# 安装依赖
yarn install

# 构建 service
yarn build:service

# 构建 web（生产版本）
yarn build:web

# 启动 service（需要先构建 web）
yarn start:service
```

## 首次启动

首次启动会显示设置向导：

1. **数据目录** - Pod 数据存储位置
2. **开机启动** - 是否开机自启
3. **部署模式** - Cloud / Local / Standalone
4. **网络接入** - 本机/局域网 / 用户公网 URL / 用户隧道

## 目录结构

```
apps/service/
├── src/
│   ├── main.ts           # Electron 入口
│   ├── lib/
│   │   ├── config.ts     # 配置管理（V2 架构）
│   │   ├── xpod.ts       # xpod 模块
│   │   ├── web-server.ts # Web 服务器
│   │   └── tray.ts       # 系统托盘
│   └── setup/
│       └── server.ts     # 首次设置向导
└── assets/
    └── iconTemplate.png  # 托盘图标
```

## 配置文件

配置存储在：
- macOS: `~/Library/Application Support/LinX/config.json`
- Windows: `%APPDATA%/LinX/config.json`
- Linux: `~/.config/linx/config.json`

### 配置结构

```typescript
interface LinxConfig {
  version: number
  deploymentMode: 'hosted' | 'standalone'
  pod: {
    port: number      // 默认 5737
    dataDir: string   // Pod 数据目录
  }
  web: {
    port: number      // 默认 5173
  }
  hosted: {
    nodeToken?: string    // Cloud 绑定令牌
    publicUrl?: string    // 用户提供的 Local SP 公网 URL
    webIdUrl?: string     // WebID URL
  }
  standalone: {
    customDomain?: string // 自定义域名
    useCloudIdp: boolean  // 是否使用 Cloud IdP
  }
  network: {
    accessMode: 'device-only' | 'direct' | 'tunnel'
    tunnelProvider?: 'cloudflare' | 'sakura'  // 隧道服务商
    tunnelToken?: string                       // 隧道 Token
  }
  autoStart: boolean
  setupCompleted: boolean
}
```

## 端口

- 5173 - Web UI
- 5199 - 设置向导（仅首次启动）
- 5737 - Solid Pod (xpod)

## 网络接入

Local SP 的公网 URL 不由 LinX 平台自动生成。用户有三种路径：

### 1. 本机/局域网

默认路径。LinX 启动本地 xpod，例如 `http://localhost:5737/`，不要求用户填写公网域名。

这条路径适合本机验证、局域网使用，或暂时没有公网域名的用户。它不等同于 Cloud IDP + Local SP 的远程访问路径。

### 2. 用户公网 URL 直连

如果本机可以被外网直连，用户需要自己提供公网 URL，例如 `https://pod.example.com/`。

用户负责 DNS、HTTPS、反向代理、防火墙和端口转发。LinX 只保存这个 URL，并用它向 Cloud 注册 Local SP。

### 3. 隧道服务（用户域名 + 隧道）

如果本机不能被外网直连，需要使用隧道服务商：

- **Cloudflare Tunnel**
- **SakuraFRP**

在这种情况下，用户需要：

- 自己提供公网 URL 或隧道供应商稳定分配的 HTTPS 域名
- 自己在域名侧完成解析与接入
- 在 LinX 中填写域名、隧道服务商和 Token

> 注意：不提供 STUN/TURN 穿透服务，避免政策风险

LinX 不提供 `node-*.undefineds.co` 到用户隧道的统一转发。

## 参考文档

- `docs/local-sp-domain-and-tunnel.md` - Local / Standalone 的域名与隧道说明
