# LinX Service

LinX Service 是一个常驻后台的统一服务，基于 xpod V2 架构，包含：

- **xpod** - Solid Pod 服务器（本地存储）
- **Web Server** - LinX Web UI
- **System Tray** - 系统托盘

默认通过 npm 依赖直接内置并启动 xpod（`@undefineds.co/xpod`），不再要求本地额外 checkout xpod 仓库。

## 部署模式

基于 xpod V2 架构，支持两种部署模式：

### 托管式（推荐）

连接 undefineds.co 获取身份服务和 DDNS：

- **WebID**: `https://id.undefineds.co/你的用户名/profile/card#me`（永久稳定）
- **DDNS**: `https://你的用户名.undefineds.xyz`（自动更新）
- **数据**: 存储在本地，平台不接触

适合：普通用户，想要稳定的 WebID 和公网访问

### 完全自托管

使用自己的域名，完全独立运行：

- **域名**: 用户自己管理（如 `pod.alice.com`）
- **身份**: 可选使用 undefineds.co IdP 或自建
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
3. **部署模式** - 托管式 or 完全自托管
4. **网络接入** - 自动检测 / Cloudflare Tunnel / SakuraFRP

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
    nodeToken?: string    // Cloud 分配的 Node Token
    subdomain?: string    // DDNS 子域名
    webIdUrl?: string     // WebID URL
  }
  standalone: {
    customDomain?: string // 自定义域名
    useCloudIdp: boolean  // 是否使用 Cloud IdP
  }
  network: {
    accessMode: 'auto' | 'tunnel'
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

用户必须有公网可访问的地址，有两种方式：

### 1. 自动检测（使用我们的 DDNS）

xpod 会自动检测网络环境，优先级：
1. **公网 IP** - 直接使用
2. **IPv6** - 自动检测
3. **UPnP** - 自动端口映射

检测成功后，自动分配 DDNS：`xxx.undefineds.xyz`

### 2. 隧道服务（服务商提供域名 + 隧道）

如果自动检测失败（无公网 IP、无 IPv6、UPnP 不可用），需要使用隧道服务商：

- **Cloudflare Tunnel** - 提供域名 + 隧道
- **SakuraFRP** - 提供域名 + 隧道

用户只需输入服务商提供的 Token。

> 注意：不提供 STUN/TURN 穿透服务，避免政策风险
