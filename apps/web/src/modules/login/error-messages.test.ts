import { describe, expect, it } from 'vitest'
import { formatLoginErrorForUser } from './error-messages'

describe('formatLoginErrorForUser', () => {
  it('hides Local provisioning internals from the user-facing message', () => {
    expect(formatLoginErrorForUser('无法完成 Local 的 Cloud 绑定：{"error":"publicUrl is required"}'))
      .toBe('本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。')
  })

  it('does not misclassify missing Local entry errors as expired login state', () => {
    expect(formatLoginErrorForUser('无法准备 Local 登录入口：{"error":"publicUrl is required","provisionCode":"secret-code"}'))
      .toBe('本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。')
  })

  it('hides ORM identifier internals from the user-facing message', () => {
    expect(formatLoginErrorForUser('findById requires a base-relative resource id. Use findByIri(resource, iri) for full IRIs.'))
      .toBe('LinX 初始化失败。请刷新页面；如果仍失败，请换一个空间重新登录。')
  })

  it('hides module and stack details from the user-facing message', () => {
    expect(formatLoginErrorForUser("Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/develop/linx/apps/desktop/xpod.js"))
      .toBe('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')
  })

  it('hides config parser details caused by paths with spaces', () => {
    expect(formatLoginErrorForUser('Invalid resource IRI: file:///Users/ganlu/Library/Application Support/@linx/desktop/local/runtime/config/local.json'))
      .toBe('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')
  })

  it('turns managed runtime install failures into download guidance', () => {
    expect(formatLoginErrorForUser('Unable to install @undefineds.co/xpod@0.3.31 with bun.\nerror: registry failed'))
      .toBe('本地空间组件下载失败。请检查网络后重试。')
  })

  it('turns Local startup timeout into retry guidance without exposing localhost URLs', () => {
    expect(formatLoginErrorForUser('等待 Local 服务就绪超时：http://localhost:5737/\n[css] Require stack: /Users/ganlu/xpod.js'))
      .toBe('本地空间启动超时。请点“重新检查”；如果仍失败，请重启 LinX。')
  })

  it('does not treat raw URLs as user-facing copy', () => {
    expect(formatLoginErrorForUser('http://localhost:5737/', '本地空间正在启动，请稍候。'))
      .toBe('本地空间正在启动，请稍候。')
    expect(formatLoginErrorForUser('file:///Users/ganlu/Library/Application Support/@linx/local.json', '本地空间正在启动，请稍候。'))
      .toBe('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')
  })

  it('turns temporary Cloud failures into an actionable message', () => {
    expect(formatLoginErrorForUser('{"error":"Service Unavailable","details":""}'))
      .toBe('登录服务暂时不可用。请稍后重试。')
  })

  it('hides default assistant storage internals from the user-facing message', () => {
    expect(formatLoginErrorForUser('Pod write failed'))
      .toBe('LinX 还不能在当前空间保存数据。请返回空间选择页，换一个空间后重试。')
  })

  it('turns Pod permission failures into user-actionable space guidance', () => {
    expect(formatLoginErrorForUser('Failed to create Pod container https://node-0000.undefineds.co/alice/.data/agents/__secretary__/: HTTP 403'))
      .toBe('这个账号还不能写入当前空间。请换一个空间；如果这是你的本地空间，请先完成空间创建。')
    expect(formatLoginErrorForUser('AI Secretary 初始化失败\nFailed to create Pod container https://id.undefineds.co/ganbb/.data/agents/__secretary__.ttl/skills/: HTTP 403'))
      .toBe('这个账号还不能写入当前空间。请换一个空间；如果这是你的本地空间，请先完成空间创建。')
  })

  it('turns Pod root container failures into data-space preparation guidance', () => {
    expect(formatLoginErrorForUser('Failed to create Pod container http://localhost:5737/test/.data/: HTTP 500 {"message":"Cannot obtain the parent of http://localhost:5737/ because it is a root container."}'))
      .toBe('当前空间还没有创建完成。请回到空间选择页，重新进入后按提示创建。')
  })

  it('turns selected storage routing failures into data-space guidance', () => {
    expect(formatLoginErrorForUser('Selected SP Pod URL was not applied after initialization: expected https://node.example/alice/, got https://id.undefineds.co/alice/'))
      .toBe('LinX 还不能把数据保存到当前空间。请换一个空间；如果这是本地空间，请先完成空间创建。')
    expect(formatLoginErrorForUser('当前空间没有声明可写入的 Pod，请换一个空间或联系空间管理员。'))
      .toBe('LinX 还不能把数据保存到当前空间。请换一个空间；如果这是本地空间，请先完成空间创建。')
  })

  it('turns account-scoped Pod creation failures into account guidance', () => {
    expect(formatLoginErrorForUser('400 {"name":"BadRequestHttpError","message":"WebID does not belong to this account.","statusCode":400,"errorCode":"H400"}'))
      .toBe('账号和当前空间不匹配。请返回空间选择页，换账号或换空间。')
  })

  it('accepts both provisionCode and providerCode spellings as expired Local login state', () => {
    expect(formatLoginErrorForUser('Invalid or expired providerCode'))
      .toBe('这次本地登录已失效。请回到空间选择页，重新点“本地空间”。')
  })

  it('hides Agent Home and resource id internals from default assistant failures', () => {
    expect(formatLoginErrorForUser('Agent resource id must be a base-relative resource id.'))
      .toBe('LinX 还不能在当前空间保存数据。请返回空间选择页，换一个空间后重试。')
    expect(formatLoginErrorForUser('Solid database is missing authenticated fetch.'))
      .toBe('LinX 还不能在当前空间保存数据。请返回空间选择页，换一个空间后重试。')
  })

  it('turns Pod initialization timeout into data space guidance', () => {
    expect(formatLoginErrorForUser('Pod init timed out'))
      .toBe('空间准备超时。请检查网络，或返回空间选择页重试。')
  })

  it('turns WebID profile read failures into account copy', () => {
    expect(formatLoginErrorForUser('读取 WebID Profile 失败：HTTP 401'))
      .toBe('登录状态已失效。请重新登录。')
  })

  it('hides xpod service start internals from service mode errors', () => {
    expect(formatLoginErrorForUser('Failed to start xpod'))
      .toBe('本地空间启动失败。请点“重新检查”；如果仍失败，请重启 LinX。')
  })

  it('turns outdated Local runtime capability errors into reinstall guidance', () => {
    expect(formatLoginErrorForUser([
      'xpod runtime at /Users/ganlu/Library/Application Support/@linx/local is missing required Local login/startup capabilities.',
      'Missing: scoped WebID selection handler',
      'Missing: escaped recursive CSS runtime config imports',
    ].join('\n')))
      .toBe('本地空间版本过旧。请重启 LinX 让它自动更新；如果仍失败，请打开本地空间设置修复。')
  })

  it('hides internal query failures from message generation errors', () => {
    expect(formatLoginErrorForUser('contact query failed', '消息生成失败。请稍后重试。'))
      .toBe('消息生成失败。请稍后重试。')
  })

  it('turns common runtime and API status errors into user-facing copy', () => {
    expect(formatLoginErrorForUser('Runtime request failed: 500'))
      .toBe('服务暂时没有响应。请稍后重试。')
    expect(formatLoginErrorForUser('API Error 403: Failed to create Pod container https://node.example/alice/.data/: forbidden'))
      .toBe('这个账号还不能写入当前空间。请换一个空间；如果这是你的本地空间，请先完成空间创建。')
    expect(formatLoginErrorForUser('Request failed 429: rate limit exceeded'))
      .toBe('请求太频繁。请稍等一会儿再试。')
  })

  it('hides short chat/runtime engineering errors from users', () => {
    expect(formatLoginErrorForUser('Thread not found: thread-123'))
      .toBe('当前内容还没有准备好。请刷新页面后重试。')
    expect(formatLoginErrorForUser('Failed to resolve chat id for thread thread-123'))
      .toBe('当前内容还没有准备好。请刷新页面后重试。')
    expect(formatLoginErrorForUser('当前 Linx 节点缺少 nodeId。'))
      .toBe('本地工作区还没有配置完成。请在设置里检查本地空间后重试。')
    expect(formatLoginErrorForUser('Solid database is not ready'))
      .toBe('LinX 还不能在当前空间保存数据。请稍后重试；如果仍失败，请换一个空间重新登录。')
    expect(formatLoginErrorForUser('Runtime session not found: abc'))
      .toBe('工作会话暂时没有响应。请重新启动工作会话后再试。')
  })

  it('turns model provider errors into model service guidance', () => {
    expect(formatLoginErrorForUser('AI Error 500: upstream failed'))
      .toBe('模型服务暂时不可用。请检查密钥、服务地址或网络后重试。')
    expect(formatLoginErrorForUser('OpenAI Error 502: bad gateway'))
      .toBe('模型服务暂时不可用。请检查密钥、服务地址或网络后重试。')
  })

  it('turns short runtime internals into user-facing copy', () => {
    expect(formatLoginErrorForUser('No response body'))
      .toBe('服务没有返回内容。请检查密钥、服务地址或网络后重试。')
    expect(formatLoginErrorForUser('Invalid JSON request body'))
      .toBe('消息发送失败。请刷新页面后重试。')
    expect(formatLoginErrorForUser('Runtime thread is not active'))
      .toBe('这个工作会话已经结束。请重新启动工作会话。')
    expect(formatLoginErrorForUser('Runtime stream ended without assistant output'))
      .toBe('工作会话暂时没有响应。请重新启动工作会话后再试。')
  })

  it('does not confuse AI key authentication errors with login expiry', () => {
    expect(formatLoginErrorForUser('API Error 401: Incorrect API key provided'))
      .toBe('密钥不可用。请检查密钥是否填写正确，或换一个密钥后重试。')
    expect(formatLoginErrorForUser('Anthropic Error 401: {"error":{"message":"invalid_api_key"}}'))
      .toBe('密钥不可用。请检查密钥是否填写正确，或换一个密钥后重试。')
  })

  it('explains expired Solid and DPoP credentials as a login problem', () => {
    expect(formatLoginErrorForUser(
      'Write failed to http://localhost:5737/alice/messages.ttl: 401 Unauthorized',
    )).toBe('登录状态已失效。请重新登录。')
    expect(formatLoginErrorForUser(
      'DPoP-bound access token: "exp" claim timestamp check failed',
    )).toBe('登录状态已失效。请重新登录。')
    expect(formatLoginErrorForUser(
      'Invalid SPARQL endpoint response from http://localhost:5737/alice/.data/chat/-/sparql (HTTP status 401)',
    )).toBe('登录状态已失效。请重新登录。')
  })

  it('hides Local space kind internals from service mode errors', () => {
    expect(formatLoginErrorForUser('spaceKind must be "local" or "standalone"'))
      .toBe('当前页面和已启动的空间不一致。请回到空间选择页重新进入。')
  })

  it('turns duplicate registration failures into direct-login guidance', () => {
    expect(formatLoginErrorForUser('HTTP 409 Conflict: already registered to this account'))
      .toBe('这个账号或空间名已经存在。请直接登录，或换一个名字。')
  })

  it('localizes short legacy product terms before showing them to users', () => {
    expect(formatLoginErrorForUser('正在启动 Local…'))
      .toBe('正在启动本地空间…')
    expect(formatLoginErrorForUser('Standalone 已准备好，接下来会打开本地登录页。'))
      .toBe('独立空间已准备好，接下来会打开本地登录页。')
    expect(formatLoginErrorForUser('使用 Cloud 账号登录，数据写入 Local 空间。'))
      .toBe('使用云端账号登录，数据写入本地空间。')
  })

  it('does not over-map ordinary not-found messages', () => {
    expect(formatLoginErrorForUser('File not found'))
      .toBe('File not found')
  })

  it('does not present a model network failure as a login failure', () => {
    expect(formatLoginErrorForUser('Model service request failed: Failed to fetch'))
      .toBe('模型服务暂时不可用。请检查密钥、服务地址或网络后重试。')
  })

  it('does not leak implementation terms in mapped user-facing messages', () => {
    const rawErrors = [
      'Failed to create Pod container https://node-0000.undefineds.co/alice/.data/agents/__secretary__/: HTTP 403',
      'AI Secretary 初始化失败\nFailed to create Pod container https://id.undefineds.co/ganbb/.data/agents/__secretary__.ttl/skills/: HTTP 403',
      '读取 WebID Profile 失败：HTTP 401',
      'findById requires a base-relative resource id. Use findByIri(resource, iri) for full IRIs.',
      "Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/Library/Application Support/@linx/xpod.js",
      '无法完成 Local 的 Cloud 绑定：{"error":"publicUrl is required","provisionCode":"pc-123"}',
      '400 {"name":"BadRequestHttpError","message":"WebID does not belong to this account.","statusCode":400,"errorCode":"H400"}',
      'Agent resource id must be a base-relative resource id.',
      'Invalid or expired providerCode',
      'Failed to create Pod container http://localhost:5737/test/.data/: HTTP 500 {"message":"Cannot obtain the parent of http://localhost:5737/ because it is a root container."}',
      'Selected SP Pod URL was not applied after initialization: expected https://node.example/alice/, got https://id.undefineds.co/alice/',
      '当前空间没有声明可写入的 Pod，请换一个空间或联系空间管理员。',
      'Thread not found: thread-123',
      'Failed to resolve chat id for thread thread-123',
      '当前 Linx 节点缺少 nodeId。',
      'Solid database is not ready',
      'Runtime session not found: abc',
      'AI Error 500: upstream failed',
      [
        'xpod runtime at /Users/ganlu/Library/Application Support/@linx/local is missing required Local login/startup capabilities.',
        'Missing: scoped WebID selection handler',
        'Missing: escaped recursive CSS runtime config imports',
      ].join('\n'),
    ]

    for (const rawError of rawErrors) {
      const formatted = formatLoginErrorForUser(rawError)
      expect(formatted).not.toMatch(/provisionCode|providerCode|publicUrl|WebID Profile|findById|IRI|HTTP\s+\d{3}|jsonld|Application Support|node_modules|localhost|xpod|BadRequestHttpError|H400|resource id|root container|Pod|Solid|Agent|Secretary|OIDC|issuer|provider|storageProvider|nodeId|Thread|AI Error|database/i)
    }
  })

  it('keeps concise user-written messages', () => {
    expect(formatLoginErrorForUser('请先验证邮箱后再登录。'))
      .toBe('请先验证邮箱后再登录。')
  })
})
