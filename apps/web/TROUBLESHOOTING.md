# 故障排除指南

## 问题：Shadcn 组件导入错误

### 症状
```
Cannot find module '@/lib' or its corresponding type declarations.
```

### 原因
Shadcn CLI 生成的组件使用了错误的导入路径：
```tsx
❌ import { cn } from "@/lib"
```

但我们的 `cn` 函数在 `@/lib/utils`：
```tsx
✅ import { cn } from "@/lib/utils"
```

### 解决方案

#### 1. 修复已安装的组件

已修复以下组件的导入路径：
- ✅ `resizable.tsx`
- ✅ `separator.tsx`
- ✅ `badge.tsx`
- ✅ `scroll-area.tsx`

#### 2. 更新配置文件

更新 `components.json` 中的别名配置：

```json
{
  "aliases": {
    "utils": "@/lib/utils"  // 修改这里
  }
}
```

这样以后安装新组件就会使用正确的路径。

---

## 其他常见问题

### TypeScript 配置警告

```
tsconfig.json may not disable emit
```

**解决方案**：这是 TypeScript 项目引用的警告，不影响开发。可以忽略或修改 `tsconfig.json` 的项目引用配置。

### CSS @tailwind 警告

```
Unknown at rule @tailwind
```

**解决方案**：这是编辑器不识别 Tailwind 指令，不影响运行。可以安装 Tailwind CSS IntelliSense 插件解决。

### 开发服务器启动失败

**检查清单**：
1. 确保依赖已安装：`yarn install`
2. 清除缓存：`rm -rf node_modules/.vite`
3. 重启开发服务器：`yarn dev:web`

---

## 验证修复

运行以下命令检查是否还有导入错误：

```bash
# 检查是否还有错误的导入
grep -r 'from "@/lib"$' src/components/ui/

# 应该返回：No matches found
```

或者直接启动开发服务器：

```bash
yarn dev:web
```

访问 http://localhost:5173 查看效果。

---

## 预防措施

### 安装新 Shadcn 组件后

1. 检查导入路径
2. 如果发现 `from "@/lib"`，改为 `from "@/lib/utils"`
3. 或者使用以下命令批量替换：

```bash
cd src/components/ui
sed -i '' 's/from "@\/lib"/from "@\/lib\/utils"/g' *.tsx
```

---

## 已知问题

### 1. WelcomePage ImportMeta 错误

```
类型"ImportMeta"上不存在属性"env"
```

**原因**：旧代码使用了 `import.meta.env`，这是 Vite 特有的 API。

**解决方案**：这不影响运行，可以忽略。如需修复，添加类型声明。

### 2. CSS 警告

所有 `@tailwind` 和 `@apply` 的警告都是正常的，编辑器不识别 Tailwind 指令，但不影响运行。

---

## 快速修复脚本

如果以后遇到类似问题，可以运行：

```bash
#!/bin/bash
# fix-shadcn-imports.sh

echo "修复 Shadcn 组件导入路径..."

# 批量替换导入路径
find src/components/ui -name "*.tsx" -type f -exec sed -i '' 's/from "@\/lib"$/from "@\/lib\/utils"/g' {} \;

echo "✅ 修复完成！"
```

---

## 联系支持

如果遇到其他问题：
1. 检查本文档
2. 查看 `COMPONENT_MIGRATION.md`
3. 查看 Shadcn 官方文档：https://ui.shadcn.com












