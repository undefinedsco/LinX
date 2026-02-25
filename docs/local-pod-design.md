# 本地 Pod 部署设计

## 概述

LinX Desktop 支持用户在本地运行 xpod（Solid Pod 服务器），并可选择通过 pods.undefineds.co 获得公网访问能力。

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│  pods.undefineds.co（云端管理服务）                               │
│  ├── 子域名注册/管理 API                                         │
│  ├── DNS 管理                                                    │
│  ├── 隧道 Token 分发                                             │
│  └── 用 Solid WebID 作为身份验证                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↕ API (Solid OIDC 验证)
┌─────────────────────────────────────────────────────────────────┐
│  LinX Desktop                                                    │
│  ├── Provider 管理（列表、添加、删除）                             │
│  ├── 调用 undefineds.co API 申请子域名                            │
│  ├── 启动/停止本地 xpod                                           │
│  └── 启动/管理隧道客户端                                          │
└─────────────────────────────────────────────────────────────────┘
                              ↕ 子进程
┌─────────────────────────────────────────────────────────────────┐
│  xpod（本地 Solid Pod）                                          │
│  └── 纯 CSS 功能，不关心域名/隧道                                  │
└─────────────────────────────────────────────────────────────────┘
```

**注意**：用户使用自己的域名时，不需要 pods.undefineds.co 服务，直接配置 xpod 即可。

## 用户流程

### 1. 选择 Provider

```
┌─────────────────────────────────────────────────────────────────┐
│  选择 Solid Pod                                                  │
│                                                                  │
│  ● pods.undefineds.co （推荐）                                    │
│      由 Undefineds 提供的托管 Pod 服务                            │
│                                                                  │
│  ○ 自己部署的 Pod                                                 │
│      输入你的 Pod URL 或创建本地 Pod                               │
│                                                                  │
│  [继续]                                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 选择"自己部署的 Pod"

```
┌─────────────────────────────────────────────────────────────────┐
│  连接自建 Pod                                                     │
│                                                                  │
│  Pod URL: [https://                          ]                   │
│                                                                  │
│  [检测连接]                                                       │
│                                                                  │
│  ─────────────────────────                                       │
│  还没有自建 Pod？[创建本地 Pod]                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3. 创建本地 Pod

```
┌─────────────────────────────────────────────────────────────────┐
│  创建本地 Pod                                                     │
│                                                                  │
│  数据目录: [~/LinX/pod              ] [浏览]                      │
│                                                                  │
│  ─────────────────────────────────────────────────────          │
│  域名配置                                                         │
│                                                                  │
│  ○ 仅本地访问（无域名）                                            │
│      通过 http://localhost:3000 访问，数据仅限本机                  │
│                                                                  │
│  ○ 申请 pods.undefineds.co 子域名（推荐）                          │
│      [           ].pods.undefineds.co                            │
│      免费获得公网访问 + HTTPS                                      │
│      ⚠️ 需要用 Solid WebID 验证身份                               │
│                                                                  │
│  ○ 使用自有域名                                                   │
│      [pod.example.com            ]                               │
│      需要自行配置 DNS 和证书                                       │
│                                                                  │
│  [创建并启动]                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 4. 申请子域名（需要 Solid 身份验证）

```
┌─────────────────────────────────────────────────────────────────┐
│  申请 pods.undefineds.co 子域名                                   │
│                                                                  │
│  子域名: [alice      ].pods.undefineds.co                        │
│                                                                  │
│  需要验证你的 Solid 身份                                          │
│                                                                  │
│  [使用 Solid WebID 登录]                                          │
│                                                                  │
│  支持任意 Solid Provider：                                        │
│  • pods.undefineds.co                                            │
│  • login.inrupt.com                                              │
│  • solidcommunity.net                                            │
│  • 或其他任意 Solid Pod                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5. 启动 Pod

```
┌─────────────────────────────────────────────────────────────────┐
│  启动本地 Pod                                                     │
│                                                                  │
│  [==============================>             ] 70%              │
│                                                                  │
│  ✓ 初始化数据目录                                                 │
│  ✓ 启动 xpod 服务                                                 │
│  ✓ 等待服务就绪                                                   │
│  ◎ 建立隧道连接...                                                │
│  ○ 验证公网访问                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6. 完成

```
┌─────────────────────────────────────────────────────────────────┐
│  ✓ 本地 Pod 已启动                                               │
│                                                                  │
│  公网地址: https://alice.pods.undefineds.co                       │
│  本地地址: http://localhost:3000                                  │
│  数据目录: ~/LinX/pod                                             │
│                                                                  │
│  [创建账户并登录]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 数据结构

### Provider

```typescript
interface SolidProvider {
  id: string;
  name: string;
  issuerUrl: string;              // https://alice.pods.undefineds.co
  isDefault?: boolean;

  // 仅本地管理的 Pod 有此字段
  managed?: {
    status: 'stopped' | 'starting' | 'running' | 'error';
    dataDir: string;
    port: number;

    domain: {
      type: 'none' | 'undefineds' | 'custom';
      value?: string;             // alice.pods.undefineds.co
    };

    tunnel?: {
      token: string;
      status: 'disconnected' | 'connecting' | 'connected';
    };
  };
}
```

### 子域名记录（undefineds.co 服务端）

```typescript
interface SubdomainRecord {
  subdomain: string;              // alice
  fqdn: string;                   // alice.pods.undefineds.co
  ownerWebId: string;             // https://xxx/profile/card#me
  tunnelToken: string;            // Cloudflare Tunnel Token
  status: 'active' | 'suspended';
  createdAt: Date;
  lastActiveAt: Date;
}
```

### Provider 存储（LinX Desktop 本地）

```json
// ~/Library/Application Support/LinX/providers.json
{
  "defaultId": "undefineds",
  "providers": [
    {
      "id": "undefineds",
      "name": "Undefineds Pod",
      "issuerUrl": "https://pods.undefineds.co",
      "isDefault": true
    },
    {
      "id": "local-alice",
      "name": "我的本地 Pod",
      "issuerUrl": "https://alice.pods.undefineds.co",
      "managed": {
        "status": "running",
        "dataDir": "/Users/alice/LinX/pod",
        "port": 3000,
        "domain": {
          "type": "undefineds",
          "value": "alice.pods.undefineds.co"
        },
        "tunnel": {
          "token": "eyJ...",
          "status": "connected"
        }
      }
    }
  ]
}
```

## API 设计

### undefineds.co 子域名管理 API

所有 API 使用 Solid OIDC Token 验证身份。

#### 检查子域名可用性

```
GET /api/subdomains/check?name=alice

Response:
{
  "available": true,
  "subdomain": "alice",
  "fqdn": "alice.pods.undefineds.co"
}
```

#### 申请子域名

```
POST /api/subdomains/claim
Authorization: DPoP <solid-oidc-token>

{
  "subdomain": "alice"
}

Response:
{
  "subdomain": "alice",
  "fqdn": "alice.pods.undefineds.co",
  "tunnelToken": "eyJ...",
  "ownerWebId": "https://xxx/profile/card#me"
}
```

#### 获取我的子域名列表

```
GET /api/subdomains/mine
Authorization: DPoP <solid-oidc-token>

Response:
{
  "subdomains": [
    {
      "subdomain": "alice",
      "fqdn": "alice.pods.undefineds.co",
      "status": "active",
      "createdAt": "2024-01-25T00:00:00Z",
      "lastActiveAt": "2024-01-25T12:00:00Z"
    }
  ]
}
```

#### 删除子域名

```
DELETE /api/subdomains/alice
Authorization: DPoP <solid-oidc-token>

Response:
{
  "success": true
}
```

#### 刷新隧道 Token

```
POST /api/subdomains/alice/refresh-token
Authorization: DPoP <solid-oidc-token>

Response:
{
  "tunnelToken": "eyJ..."
}
```

## LinX Desktop IPC 接口

### Provider 管理

```typescript
interface ElectronAPI {
  providers: {
    list(): Promise<SolidProvider[]>;
    add(provider: SolidProvider): Promise<void>;
    remove(id: string): Promise<void>;
    setDefault(id: string): Promise<void>;
    update(id: string, updates: Partial<SolidProvider>): Promise<void>;
  };
}
```

### xpod 管理

```typescript
interface ElectronAPI {
  xpod: {
    start(config: XpodConfig): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    getStatus(): Promise<XpodStatus>;
    getLogs(lines?: number): Promise<string[]>;
  };
}
```

### 隧道管理

```typescript
interface ElectronAPI {
  tunnel: {
    start(token: string): Promise<void>;
    stop(): Promise<void>;
    getStatus(): Promise<TunnelStatus>;
  };
}
```

### 子域名 API（代理到 undefineds.co）

```typescript
interface ElectronAPI {
  subdomain: {
    check(name: string): Promise<{ available: boolean }>;
    claim(name: string): Promise<SubdomainRecord>;
    list(): Promise<SubdomainRecord[]>;
    delete(name: string): Promise<void>;
    refreshToken(name: string): Promise<{ tunnelToken: string }>;
  };
}
```

## 技术实现

### xpod 启动

```typescript
// apps/desktop/src/main.ts
function startXpod(config: XpodConfig) {
  const xpodRoot = getXpodRoot();

  supervisor.register({
    name: 'xpod',
    command: 'node',
    args: ['dist/main.js'],
    cwd: xpodRoot,
    env: {
      CSS_PORT: config.port.toString(),
      CSS_ROOT_FILE_PATH: config.dataDir,
      CSS_BASE_URL: config.domain?.value
        ? `https://${config.domain.value}`
        : `http://localhost:${config.port}`,
    },
  });

  supervisor.start('xpod');
}
```

### 隧道启动

```typescript
// 使用 Cloudflare Tunnel
function startTunnel(token: string) {
  supervisor.register({
    name: 'tunnel',
    command: 'cloudflared',
    args: ['tunnel', 'run', '--token', token],
  });

  supervisor.start('tunnel');
}
```

### Provider 检测

```typescript
async function detectProvider(url: string): Promise<DetectResult> {
  try {
    const oidcUrl = new URL('/.well-known/openid-configuration', url);
    const response = await fetch(oidcUrl.toString(), {
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const config = await response.json();
      return {
        success: true,
        issuer: config.issuer,
        name: extractProviderName(url),
      };
    }

    return { success: false, error: 'not-solid' };
  } catch (e) {
    return { success: false, error: 'connection-failed' };
  }
}
```

## 文件结构

```
apps/desktop/
├── src/
│   ├── main.ts                    # Electron 主进程
│   ├── preload.ts                 # IPC 暴露
│   ├── lib/
│   │   ├── config-manager.ts      # 配置管理
│   │   ├── provider-manager.ts    # Provider 管理（新增）
│   │   ├── xpod-manager.ts        # xpod 启动/停止（新增）
│   │   └── tunnel-manager.ts      # 隧道管理（新增）
│   └── pages/
│       └── config.html
├── vendor/
│   └── xpod -> /path/to/xpod
└── package.json

apps/web/
├── src/
│   └── modules/
│       └── login/
│           ├── ProviderSelect.tsx      # Provider 选择页
│           ├── ProviderConnect.tsx     # 连接自建 Pod
│           ├── LocalPodSetup.tsx       # 创建本地 Pod
│           ├── SubdomainClaim.tsx      # 申请子域名
│           └── LocalPodStatus.tsx      # Pod 状态管理
```

## 依赖

### LinX Desktop

- xpod - 本地 Solid Pod 服务器
- 隧道客户端 - 由 xpod 决定具体实现

### undefineds.co 服务

- DNS 管理
- 隧道管理
- Solid OIDC 验证
