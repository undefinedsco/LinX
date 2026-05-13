# Module Spec: Profile / Settings

## 目标

Profile 和 Settings 是低频入口。主流程不应该被账号说明、provider 选择器或复杂配置打断。

## 范围

- 头像个人卡片。
- 退出登录。
- 账号摘要。
- 服务状态。
- 模型服务入口。
- Local/Cloud provider 管理入口。

## 不做

- 不在已有账户主界面展示 provider 选择器。
- 不在登录后用长说明阻断进入 LinX。
- 不在主壳首屏解释 OIDC、SP、Pod 内部概念。

## 个人卡片

展示：

- 用户名称或 WebID 摘要。
- 当前 provider：Cloud / Local。
- 当前 Pod 状态。
- 操作：个人资料、退出登录。

如果没有用户 logo，默认用产品 logo 或头像 token，不用字母占位作为最终态。

## 设置入口

设置页分组：

- 账号。
- 服务。
- 模型服务。
- Local 供应商。
- 关于。

## 退出登录

点击退出：

1. 清理当前 Solid session。
2. 清理 UI 选中状态。
3. 主界面立即消失。
4. 显示登录入口。
5. 不保留误导性的“正在恢复登录状态”。

## Local provider

Local 服务只在用户选择 Local 路径时启动。

设置中可以配置：

- Local 服务状态。
- 隧道 token。
- 外网域名。
- 局域网访问提示。

## 验收

- 已登录用户不会再看到 provider 选择器。
- 退出后主界面消失。
- 重新登录能恢复主界面。
- Local 相关设置不影响 Cloud-only 登录。
