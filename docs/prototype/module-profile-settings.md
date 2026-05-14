# Module Spec: Profile / Settings

## 目标

Profile 和 Settings 是低频入口。主流程不应该被账号说明、provider 选择器或复杂配置打断。

## 范围

- 头像个人卡片。
- 退出登录。
- 账号摘要。
- 服务状态。
- 密钥入口。
- 模型入口。
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
- Local 供应商。
- 关于。

## 密钥与模型

密钥和模型是与设置并列的左下底部菜单二级页面，不嵌在设置页里。两者共同构成共享 AI 配置池，不属于 Contact、Agent 个人卡片或 Session 详情。

供应商只是密钥页和模型页里的分组，例如 OpenAI、RightCodes、OpenAI-compatible；不另做供应商设置页。

密钥模块展示：

- 命名密钥。
- provider。
- masked key。
- 使用范围。
- default / ready / paused 状态。
- 当前是否 active。
- 当前是否 in use。
- 最近使用来源。
- 异常状态，例如 HTTP 429 / rate limited、HTTP 500 / server error。

模型模块展示：

- 模型名称。
- provider。
- 路由用途。
- 使用的 credential。
- 默认模型与 fallback 策略。

Agent 只保存默认偏好或运行策略：优先使用标记为 default 的 provider/model/credential；没有 default 时再按共享配置池策略轮询或提示配置。

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
- 密钥和模型只在左下低频入口出现，不阻断 Chat 首屏。
- 密钥不会展示明文 API key，也不会出现在联系人详情或 Session 详情里。
- 密钥列表能看出当前激活、使用中、429/rate limited 和 500/server error 状态。
- 供应商只作为密钥和模型的分组，不额外出现供应商设置页。
