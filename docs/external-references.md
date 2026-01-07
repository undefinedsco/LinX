# External Code References

## Chat UI Projects

### Cherry Studio (MIT)
- **Repo**: https://github.com/CherryHQ/cherry-studio
- **参考**: Markdown 渲染、消息组件、Block 系统设计
- **关键目录**:
  - `src/renderer/src/pages/home/Messages/`
  - `src/renderer/src/pages/home/Markdown/`

### LobeChat (MIT)
- **Repo**: https://github.com/lobehub/lobe-chat
- **参考**: 交互设计、主题系统、对话分支
- **特色功能**: CoT 可视化、Artifacts、分支对话、MCP 插件
- **技术栈**: Next.js + TypeScript

### assistant-ui (MIT)
- **Repo**: https://github.com/assistant-ui/assistant-ui
- **用途**: React 聊天组件 (基于 shadcn/ui)
- **提供**: Markdown 渲染、代码高亮、流式响应、Tool Calls
- **包**: `@assistant-ui/react`

## Feature Priority Matrix

| 功能 | Cherry Studio | LobeChat | 优先级 |
|------|--------------|----------|--------|
| Markdown + 代码高亮 | ✅ | ✅ | P0 |
| 流式响应 | ✅ | ✅ | P0 |
| 消息操作栏 | ✅ | ✅ | P0 |
| 思考过程 (CoT) | ✅ | ✅ | P0 |
| 分支对话 | ❌ | ✅ | P1 |
| Artifacts 预览 | ❌ | ✅ | P1 |
| Mermaid 图表 | ✅ | ✅ | P1 |
| 多主题 | ✅ | ✅ | P2 |
| 语音输入 | ✅ | ✅ | P2 |

## Solid Ecosystem

### SolidOS
- **Repo**: https://github.com/SolidOS
- **用途**: 参考标准 Solid 数据结构，确保与 SolidOS 应用互操作
- **本地 Schema**: `packages/models/src/schemas/solid-os/`
