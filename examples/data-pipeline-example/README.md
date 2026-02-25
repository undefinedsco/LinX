# 数据管线样例

演示 LinX 的核心数据流：React State ↔ TanStack Query ↔ Solid Pod

## 功能特性

- ✅ 聊天列表（带分页和排序）
- ✅ 搜索和过滤
- ✅ 聊天详情页
- ✅ 创建新聊天
- ✅ TanStack Query 缓存
- ✅ Zustand UI 状态管理
- ✅ 类型安全的数据流

## 技术栈

- **React 18.3** + TypeScript
- **TanStack Query** - 数据获取和缓存
- **Zustand** - UI 状态管理
- **shadcn/ui** - UI 组件
- **Tailwind CSS** - 样式
- **Mock drizzle-solid** - 模拟 Solid Pod 数据

## 运行方式

```bash
cd examples/data-pipeline-example
npm install
npm run dev
```

## 数据流说明

```
用户操作 (搜索、点击)
    ↓
UI Actions (zustand)
    ↓
TanStack Query Hooks  
    ↓
Mock Solid Pod (drizzle-solid)
    ↓
自动缓存更新
    ↓ 
UI 重新渲染
```

## 文件结构

- `src/hooks/` - TanStack Query hooks
- `src/stores/` - Zustand 状态管理
- `src/components/` - React 组件
- `src/lib/` - 工具和配置