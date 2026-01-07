# LinX 安全和加密方案

> LinX 的数据安全、隐私保护和加密实现
> 
> 创建时间：2025-11-06
> 状态：📋 设计规划中

---

## 📋 目录

- [1. 概述](#1-概述)
- [2. API 密钥加密](#2-api-密钥加密)
- [3. Solid Pod 权限](#3-solid-pod-权限)
- [4. 传输安全](#4-传输安全)
- [5. 本地存储安全](#5-本地存储安全)

---

## 1. 概述

LinX 的安全设计遵循以下原则：
- **端到端加密**：敏感数据在传输和存储时都加密
- **最小权限**：应用和 AI 只获得必要的权限
- **用户控制**：用户完全掌控自己的数据和密钥
- **透明可审计**：加密算法和流程公开透明

---

## 2. API 密钥加密

### 2.1 需求

用户需要在 LinX 中存储 AI 服务的 API 密钥（OpenAI、Anthropic 等），这些密钥：
- 极其敏感，泄露会造成经济损失
- 需要加密存储在 Pod 中
- 只有用户本人可以解密

### 2.2 加密方案

**选定方案**：**Web Crypto API + PBKDF2 + AES-GCM**

#### 技术细节

```typescript
// 加密流程
async function encryptAPIKey(
  apiKey: string, 
  userPassword: string
): Promise<EncryptedData> {
  // 1. 生成盐值（随机）
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // 2. 使用 PBKDF2 从用户密码派生加密密钥
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(userPassword),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000, // 10万次迭代
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  // 3. 生成 IV（初始化向量）
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // 4. 使用 AES-GCM 加密
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    new TextEncoder().encode(apiKey)
  );
  
  // 5. 返回加密数据（包含 salt、iv、密文）
  return {
    salt: Array.from(salt),
    iv: Array.from(iv),
    encrypted: Array.from(new Uint8Array(encrypted)),
    algorithm: 'AES-GCM-256',
    iterations: 100000
  };
}

// 解密流程
async function decryptAPIKey(
  encryptedData: EncryptedData,
  userPassword: string
): Promise<string> {
  // 1. 重新派生密钥（使用存储的 salt）
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(userPassword),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(encryptedData.salt),
      iterations: encryptedData.iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  // 2. 解密
  const decrypted = await crypto.subtle.decrypt(
    { 
      name: 'AES-GCM', 
      iv: new Uint8Array(encryptedData.iv) 
    },
    key,
    new Uint8Array(encryptedData.encrypted)
  );
  
  return new TextDecoder().decode(decrypted);
}
```

#### 数据结构

**存储在 Pod 中的格式**：

```typescript
interface EncryptedAPIKeyRecord {
  id: string;                  // 密钥 ID
  provider: string;            // 供应商（OpenAI, Anthropic 等）
  name: string;                // 用户命名
  encryptedKey: {
    salt: number[];            // PBKDF2 盐值
    iv: number[];              // AES-GCM IV
    encrypted: number[];       // 加密后的密钥
    algorithm: string;         // 算法标识
    iterations: number;        // PBKDF2 迭代次数
  };
  createdAt: string;
  lastUsed: string;
}
```

### 2.3 密码来源选项

#### 选项 A：使用 Solid Pod 密码（推荐）

**优点**：
- 用户无需记忆额外密码
- 与 Pod 访问自然关联

**缺点**：
- LinX 需要保存用户的 Pod 密码派生密钥
- Solid 服务器重启后需要重新登录

**实现**：
```typescript
// 登录时保存密码派生的主密钥
async function onSolidLogin(username: string, password: string) {
  // 正常 Solid 登录
  await solidSession.login(username, password);
  
  // 派生并保存主密钥（仅在内存中）
  const masterKey = await deriveMasterKey(password);
  sessionStorage.setItem('linx_master_key', masterKey);
}
```

#### 选项 B：单独设置加密密码

**优点**：
- 更高的安全性
- 密码与 Solid 账户分离

**缺点**：
- 用户需要记忆额外密码
- 忘记密码无法恢复

**UI 设计**：
```
首次添加 API 密钥时：
┌──────────────────────────────────┐
│  设置加密密码                     │
├──────────────────────────────────┤
│  为了保护您的 API 密钥，         │
│  请设置一个加密密码。             │
│                                  │
│  加密密码: [____________]        │
│  确认密码: [____________]        │
│                                  │
│  ⚠️ 忘记此密码将无法恢复密钥！   │
│                                  │
│  [取消]  [设置密码]              │
└──────────────────────────────────┘
```

### 2.4 备选方案：设备级加密

**浏览器**：Web Crypto API（已采用）

**桌面端**：系统钥匙串
- macOS：Keychain
- Windows：Credential Manager
- Linux：Secret Service / libsecret

**移动端**：
- iOS：Keychain
- Android：Keystore

**优点**：
- 用户体验更好（无需输入密码）
- 系统级安全保护

**缺点**：
- 无法跨设备同步
- 依赖特定平台 API

**建议**：桌面端和移动端可考虑此方案

---

## 3. Solid Pod 权限

### 3.1 权限模型

LinX 使用 Solid 的 Web Access Control (WAC) 进行权限管理：

```turtle
# 示例：允许 AI 助手读取用户的联系人
@prefix acl: <http://www.w3.org/ns/auth/acl#>.

<#AIReadContacts>
    a acl:Authorization;
    acl:agent <https://linx-ai.example/assistant#me>;
    acl:accessTo <https://user.pod/contacts/>;
    acl:mode acl:Read.
```

### 3.2 AI 权限授权流程

1. 用户添加 AI 联系人
2. AI 请求访问特定 Pod 数据
3. 弹出权限授权界面
4. 用户确认授权
5. 写入 ACL 规则到 Pod

### 3.3 权限管理 UI

```
AI 联系人详情页：

┌─────────────────────────────────┐
│  AI 助手权限                     │
├─────────────────────────────────┤
│  ✓ 读取联系人                    │
│  ✓ 读取聊天记录                  │
│  ✓ 读取文件列表                  │
│  ✗ 写入文件                      │
│  ✗ 删除数据                      │
│                                 │
│  [管理权限...]                   │
└─────────────────────────────────┘
```

---

## 4. 传输安全

### 4.1 HTTPS 强制

- 所有 LinX 服务必须使用 HTTPS
- 开发环境使用自签名证书

### 4.2 API 调用安全

**与云端 AI 服务通信**：
- 使用 HTTPS
- API 密钥通过请求头传递
- 支持代理（企业环境）

**与 Solid Pod 通信**：
- 使用 Solid 的认证机制（DPoP）
- HTTPS 传输

---

## 5. 本地存储安全

### 5.1 敏感数据处理

**不应存储在本地**：
- API 密钥明文
- 用户密码明文
- 会话令牌明文

**可以存储在本地**：
- 加密后的 API 密钥（从 Pod 缓存）
- 会话 ID（不含令牌）
- UI 偏好设置

### 5.2 IndexedDB 加密

如果需要在 IndexedDB 中缓存敏感数据：

```typescript
// 使用派生的数据库密钥加密
class SecureStorage {
  private dbKey: CryptoKey;
  
  async encrypt(data: any): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.dbKey,
      new TextEncoder().encode(JSON.stringify(data))
    );
    
    // 存储 IV + 密文
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    return result.buffer;
  }
}
```

---

## 6. 安全审计

### 6.1 日志记录

记录以下安全事件（不记录敏感内容）：
- API 密钥的添加/删除
- AI 权限的授予/撤销
- 异常的 API 调用（失败次数）

### 6.2 漏洞响应

- 定期审查依赖库的安全漏洞
- 快速响应和修复安全问题
- 及时通知用户

---

## 7. 下一步行动

### 设计阶段
- [ ] 确定最终采用哪种密码方案（Pod 密码 vs 单独密码）
- [ ] 设计 API 密钥管理界面
- [ ] 设计 AI 权限授权界面

### 实现阶段
- [ ] 实现 API 密钥加密/解密
- [ ] 实现 Solid ACL 权限管理
- [ ] 实现安全审计日志
- [ ] 桌面端考虑集成系统钥匙串

### 测试阶段
- [ ] 加密算法测试
- [ ] 权限控制测试
- [ ] 安全渗透测试

---

## 8. 参考资料

- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Solid Web Access Control](https://solidproject.org/TR/wac)
- [OWASP 加密存储](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

---

## 9. 更新日志

| 日期 | 更新内容 |
|------|---------|
| 2025-11-06 | 创建安全和加密方案文档 |
| | - 定义 API 密钥加密方案（AES-GCM） |
| | - 设计 Solid Pod 权限管理 |
| | - 规划传输和存储安全 |













