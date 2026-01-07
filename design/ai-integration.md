# LinX AI 集成方案

> LinX 的 AI 功能集成设计，包括云端模型和本地模型支持
> 
> 创建时间：2025-11-06
> 状态：📋 设计规划中

---

## 📋 目录

- [1. 概述](#1-概述)
- [2. AI 类型](#2-ai-类型)
- [3. 本地 Ollama 集成](#3-本地-ollama-集成)
- [4. 云端模型集成](#4-云端模型集成)
- [5. AI 模型切换](#5-ai-模型切换)
- [6. Pod 层 AI 支持](#6-pod-层-ai-支持)

---

## 1. 概述

LinX 支持多种 AI 模型，用户可以根据需求选择：
- **云端 AI**：通过 API 调用 GPT、Claude 等大模型
- **本地 AI**：通过 Ollama 运行本地开源模型
- **未来**：Pod 层 AI 支持（Pod 作为 AI 的存储和记忆）

---

## 2. AI 类型

### 2.1 默认 AI 助手

- **定位**：系统内置的 AI 助手，帮助用户管理 Pod 数据
- **能力**：
  - 理解用户自然语言指令
  - 操作 Pod 中的数据（读取、写入、搜索）
  - 回答问题、提供建议
- **模型来源**：LinX 提供的模型（云端或本地）

### 2.2 自定义 AI 联系人

- 用户可以创建多个 AI 联系人
- 每个 AI 可以配置不同的模型
- 不同用途的 AI（写作助手、代码助手、翻译等）

### 2.3 AI 权限管理

- **Solid 鉴权机制**：每个 AI 作为独立应用，走 Solid 的权限系统
- 用户可以授权 AI 访问特定的 Pod 数据
- 细粒度权限控制（读、写、删除）

---

## 3. 本地 Ollama 集成

### 3.1 功能需求

- [x] **支持录入本机 Ollama 模型**
- [x] **可切换为默认 AI**
- [x] **离线时自动切换到本地模型**

### 3.2 配置界面

**位置**：设置 → AI 模型管理 → 本地模型

**配置项**：
- Ollama 服务地址（默认 `http://localhost:11434`）
- 已安装的模型列表（自动检测）
- 选择默认模型
- 测试连接

### 3.3 技术实现

#### Ollama API 集成

```typescript
// Ollama 客户端
class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  // 获取可用模型列表
  async listModels(): Promise<Model[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    return response.json();
  }

  // 发送聊天消息
  async chat(model: string, messages: Message[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false })
    });
    const data = await response.json();
    return data.message.content;
  }

  // 流式聊天
  async chatStream(
    model: string, 
    messages: Message[], 
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true })
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);
      
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data.message?.content) {
          onChunk(data.message.content);
        }
      }
    }
  }
}
```

#### 离线检测和自动切换

```typescript
// AI 模型管理器
class AIModelManager {
  private currentModel: AIModel;
  private fallbackModel: AIModel | null;
  
  async detectConnection(): Promise<boolean> {
    // 检测云端 API 是否可用
    const cloudAvailable = await this.checkCloudAPI();
    
    // 检测本地 Ollama 是否可用
    const ollamaAvailable = await this.checkOllama();
    
    // 自动切换逻辑
    if (!cloudAvailable && ollamaAvailable) {
      this.switchToOllama();
      return true;
    }
    
    return cloudAvailable;
  }
  
  private async checkOllama(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### 3.4 UI 设计

**设置界面 → 本地模型配置**

```
┌─────────────────────────────────────────┐
│  本地 AI 模型 (Ollama)                   │
├─────────────────────────────────────────┤
│                                         │
│  服务地址                                │
│  [http://localhost:11434        ] [测试]│
│                                         │
│  状态: ● 已连接                          │
│                                         │
│  已安装的模型                            │
│  ┌─────────────────────────────────┐   │
│  │ ○ llama3.2:latest               │   │
│  │ ● qwen2.5:7b (默认)             │   │
│  │ ○ mistral:7b                    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [ ] 离线时自动切换到本地模型            │
│                                         │
│  [保存设置]                              │
└─────────────────────────────────────────┘
```

---

## 4. 云端模型集成

### 4.1 支持的供应商

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- 其他自定义 API

### 4.2 API 密钥管理

> 详见 [安全和加密文档](./security.md)

---

## 5. AI 模型切换

### 5.1 切换策略

1. **手动切换**
   - 用户在设置中选择默认 AI 模型
   - 每个 AI 联系人可以单独配置模型

2. **自动降级**
   - 云端 API 不可用 → 自动切换到本地模型
   - 本地模型不可用 → 提示用户无法使用 AI

3. **智能选择**
   - 简单任务 → 本地小模型（速度快）
   - 复杂任务 → 云端大模型（效果好）

### 5.2 UI 设计

**聊天界面 - 模型切换器**

```
对话框顶部：
[AI 助手 ▼] [qwen2.5:7b (本地) ▼]
```

点击后展开：
```
┌──────────────────────────┐
│ 当前模型                  │
├──────────────────────────┤
│ ● qwen2.5:7b (本地)      │
│ ○ GPT-4 (云端)           │
│ ○ Claude-3 (云端)        │
├──────────────────────────┤
│ [管理模型...]            │
└──────────────────────────┘
```

---

## 6. Pod 层 AI 支持

### 6.1 未来规划

**目标**：Pod 不仅存储数据，也提供 AI 服务

**设想**：
- 用户可以在 Pod 中部署 AI 模型
- AI 直接访问 Pod 数据，无需传输到客户端
- Pod 之间可以共享 AI 服务

**技术挑战**：
- Pod 服务器的计算能力
- AI 模型的存储和加载
- 跨 Pod 的 AI 服务发现

### 6.2 进一步讨论

此功能需要进一步讨论和设计：
- [ ] Pod 服务器架构
- [ ] AI 模型部署方式
- [ ] 服务发现和调用机制
- [ ] 隐私和安全考虑

---

## 7. 下一步行动

### 设计阶段
- [ ] 设计 Ollama 配置界面的详细交互
- [ ] 设计 AI 模型切换的 UI/UX
- [ ] 设计离线状态的提示和处理

### 实现阶段
- [ ] 实现 Ollama 客户端
- [ ] 实现模型自动检测和切换
- [ ] 实现 API 密钥管理（见安全文档）
- [ ] 实现 AI 联系人的模型配置
- [ ] 集成到聊天界面

### 未来规划
- [ ] 调研 Pod 层 AI 的可行性
- [ ] 设计 Pod AI 服务架构
- [ ] 原型验证

---

## 8. 参考资料

- [Ollama API 文档](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [LinX 产品定位文档](./product-definition.md)
- [安全和加密文档](./security.md)

---

## 9. 更新日志

| 日期 | 更新内容 |
|------|---------|
| 2025-11-06 | 创建 AI 集成方案文档 |
| | - 定义 AI 类型和权限 |
| | - 设计 Ollama 集成方案 |
| | - 规划 Pod 层 AI 支持 |













