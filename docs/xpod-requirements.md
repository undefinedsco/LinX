# xpod 需求：支持 LinX Desktop 本地部署

## 背景

LinX Desktop 需要在本地启动 xpod 作为 Solid Pod 服务器，并支持通过 pods.undefineds.co 获得公网访问能力。

本文档描述 xpod 及 undefineds.co 云端服务需要支持的功能。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│  pods.undefineds.co（云端服务）                                   │
│  ├── 子域名管理 API                                              │
│  ├── DNS 管理（Cloudflare）                                      │
│  ├── 隧道 Token 管理                                             │
│  └── Solid OIDC 身份验证                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│  LinX Desktop                                                    │
│  ├── 启动 xpod 子进程                                            │
│  ├── 启动 cloudflared 隧道                                       │
│  └── 调用 undefineds.co API                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│  xpod（本地）                                                    │
│  └── 标准 CSS 功能                                               │
└─────────────────────────────────────────────────────────────────┘
```

## 需求清单

### 1. xpod 本体

#### 1.1 支持环境变量配置

xpod 已支持通过环境变量配置，LinX Desktop 会设置以下变量：

**基础配置：**

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `CSS_EDITION` | 运行模式 | `local` |
| `XPOD_MODE` | 运行模式 | `local` |
| `CSS_PORT` | 监听端口 | `5737` |
| `CSS_LOGGING_LEVEL` | 日志级别 | `info` |

**数据层：**

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `CSS_SPARQL_ENDPOINT` | SPARQL 存储 | `sqlite:./data/quadstore.sqlite` |
| `CSS_IDENTITY_DB_URL` | 身份数据库 | `sqlite:./data/identity.sqlite` |

**自管式域名（用户自己的域名）：**

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `CSS_BASE_URL` | 对外 URL | `https://my-pod.example.com` |
| `CLOUDFLARE_TUNNEL_TOKEN` | 隧道 Token（可选） | `eyJ...` |

**托管式域名（使用 pods.undefineds.co）：**

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `XPOD_CLOUD_API_ENDPOINT` | 云端 API | `https://api.undefineds.co` |
| `XPOD_NODE_ID` | 节点 ID | `alice-macbook` |
| `XPOD_NODE_TOKEN` | 节点 Token | `eyJ...` |
| `CLOUDFLARE_TUNNEL_TOKEN` | 隧道 Token | `eyJ...` |

**状态：** ✅ 已支持

#### 1.2 支持动态 BASE_URL

当用户配置子域名时，xpod 的 `CSS_BASE_URL` 会是公网域名（如 `https://alice.pods.undefineds.co`），但实际监听在 `localhost:3000`。

需要确保：
- WebID 使用 `CSS_BASE_URL` 生成
- OIDC issuer 使用 `CSS_BASE_URL`
- 内部不校验 Host header（因为隧道会改写）

**状态：** ⚠️ 需要验证

#### 1.3 健康检查端点

LinX Desktop 需要检测 xpod 是否就绪：

```
GET /health
Response: { "status": "ok" }
```

**状态：** ⚠️ 需要添加（或使用现有的 `/.well-known/solid`）

---

### 2. pods.undefineds.co 云端服务

这是一个独立的管理服务，不是 xpod 的一部分。

#### 2.1 子域名管理 API

##### 检查子域名可用性

```
GET /api/subdomains/check?name=alice

Response 200:
{
  "available": true,
  "subdomain": "alice",
  "fqdn": "alice.pods.undefineds.co"
}

Response 200 (已被占用):
{
  "available": false,
  "subdomain": "alice",
  "reason": "already-taken"
}
```

##### 申请子域名

```
POST /api/subdomains/claim
Authorization: DPoP <solid-oidc-token>
Content-Type: application/json

{
  "subdomain": "alice"
}

Response 201:
{
  "subdomain": "alice",
  "fqdn": "alice.pods.undefineds.co",
  "tunnelToken": "eyJ...",
  "ownerWebId": "https://someuser.inrupt.net/profile/card#me"
}

Response 409 (已被占用):
{
  "error": "subdomain-taken",
  "message": "Subdomain 'alice' is already taken"
}

Response 401 (未认证):
{
  "error": "unauthorized",
  "message": "Valid Solid OIDC token required"
}
```

##### 获取我的子域名列表

```
GET /api/subdomains/mine
Authorization: DPoP <solid-oidc-token>

Response 200:
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

##### 删除子域名

```
DELETE /api/subdomains/alice
Authorization: DPoP <solid-oidc-token>

Response 204: (no content)

Response 403:
{
  "error": "forbidden",
  "message": "You don't own this subdomain"
}
```

##### 刷新隧道 Token

```
POST /api/subdomains/alice/refresh-token
Authorization: DPoP <solid-oidc-token>

Response 200:
{
  "tunnelToken": "eyJ..."
}
```

#### 2.2 Solid OIDC 身份验证

所有需要身份的 API 使用 Solid OIDC DPoP Token 验证：

1. 客户端从任意 Solid Provider 获取 OIDC Token
2. 使用 DPoP 格式发送请求
3. 服务端验证 Token 并提取 WebID
4. WebID 作为用户唯一标识

验证流程：
```
Authorization: DPoP <access_token>
DPoP: <dpop_proof>
```

服务端需要：
- 验证 DPoP proof
- 验证 access_token
- 提取 WebID claim

#### 2.3 DNS 管理

申请子域名后，服务端自动配置 DNS 记录，将子域名指向隧道入口。

**支持的 DNS 提供商：**
- Cloudflare
- 腾讯云 DNSPod

**环境变量：**

```bash
# Cloudflare
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ZONE_ID=xxx

# 腾讯云
TENCENT_DNS_SECRET_ID=xxx
TENCENT_DNS_SECRET_KEY=xxx
```

#### 2.4 隧道管理

为每个子域名创建隧道连接，使本地 xpod 可通过公网访问。

**支持的隧道方案：**
- Cloudflare Tunnel（优先）

**流程：**
1. 用户申请子域名
2. 服务端创建 Cloudflare Tunnel
3. 配置 DNS CNAME 指向 tunnel
4. 返回 Tunnel Token 给客户端
5. 客户端运行 `cloudflared tunnel run --token xxx`

**环境变量：**

```bash
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ACCOUNT_ID=xxx
```

#### 2.5 HTTPS 证书管理

**场景分析：**

| 场景 | 证书来源 | 说明 |
|------|---------|------|
| pods.undefineds.co 子域名 + CF Tunnel | Cloudflare 自动 | 无需管理 |
| 自定义域名 + CF Tunnel | Cloudflare 自动 | 无需管理 |
| 自定义域名 + 直连（无隧道） | Let's Encrypt | 需要 ACME 自动续期 |

**Let's Encrypt 集成（自定义域名直连场景）：**

xpod 需要支持自动申请和续期 Let's Encrypt 证书：

```bash
# 环境变量
CSS_BASE_URL=https://pod.example.com
CSS_ACME_ENABLED=true
CSS_ACME_EMAIL=admin@example.com
CSS_ACME_DIRECTORY=https://acme-v02.api.letsencrypt.org/directory

# 证书存储路径
CSS_CERT_PATH=./data/certs/
```

**DNS-01 挑战（支持内网部署）：**

如果 xpod 在内网且无法被外部访问，使用 DNS-01 挑战：

```bash
CSS_ACME_CHALLENGE=dns-01

# DNS 提供商（用于自动添加 TXT 记录）
CLOUDFLARE_API_TOKEN=xxx
# 或
TENCENT_DNS_SECRET_ID=xxx
TENCENT_DNS_SECRET_KEY=xxx
```

**HTTP-01 挑战（公网直连场景）：**

如果 xpod 可被外部访问，使用 HTTP-01 挑战（更简单）：

```bash
CSS_ACME_CHALLENGE=http-01
```

---

### 3. 数据模型

#### 3.1 子域名记录

```typescript
interface SubdomainRecord {
  id: string;                     // UUID
  subdomain: string;              // alice
  fqdn: string;                   // alice.pods.undefineds.co
  ownerWebId: string;             // https://xxx/profile/card#me

  // 隧道
  tunnelId: string;               // 隧道 ID
  tunnelToken: string;            // 加密存储

  // 状态
  status: 'active' | 'suspended' | 'deleted';

  // 时间戳
  createdAt: Date;
  lastActiveAt: Date;             // 隧道最后连接时间
  deletedAt?: Date;
}
```

#### 3.2 存储

- PostgreSQL 或 SQLite
- tunnelToken 需要加密存储

---

### 4. 安全考虑

#### 4.1 子域名限制

- 每个 WebID 最多申请 N 个子域名（可配置，如免费 3 个）
- 子域名格式限制：`^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$`
- 保留子域名列表：`www`, `api`, `admin`, `mail`, 等

#### 4.2 隧道安全

- Tunnel Token 仅在申请时返回一次
- 支持 refresh-token 重新生成
- Token 泄露后用户可以主动刷新

#### 4.3 滥用防护

- 速率限制
- 长期不活跃的子域名可能被回收（提前通知）

---

### 5. 部署

#### 5.1 pods.undefineds.co 服务

- 独立的 Node.js 服务
- 需要 DNS 管理权限
- 需要数据库（PostgreSQL 推荐）

#### 5.2 依赖

- Solid OIDC 验证库
- DNS 管理（具体实现由 xpod 团队决定）
- 隧道管理（具体实现由 xpod 团队决定）

---

## 实现优先级

### Phase 1：基础功能

1. xpod 验证环境变量配置
2. pods.undefineds.co 服务基础框架
3. 子域名检查 + 申请 API
4. DNS 集成
5. 隧道集成

### Phase 2：完善功能

1. Solid OIDC 身份验证
2. 子域名列表 + 删除
3. Token 刷新
4. 用量统计

### Phase 3：运维功能

1. 管理后台
2. 不活跃子域名回收
3. 付费套餐（更多子域名）

---

## 设计决策

1. **子域名配额**：暂不限制，随便用
2. **不活跃回收**：暂不实现
3. **自定义域名**：支持，用户使用自己的域名时不需要 pods.undefineds.co 服务
4. **隧道方案**：先支持 Cloudflare Tunnel
5. **DNS 方案**：支持 Cloudflare 和腾讯云 DNSPod
