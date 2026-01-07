// ChatKit API 处理器
export async function handleChatKitRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const method = request.method
  
  // 获取 Authorization header 中的 API key
  const authHeader = request.headers.get('Authorization')
  const apiKey = authHeader?.replace('Bearer ', '')
  
  if (!apiKey) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 处理不同的ChatKit端点
  if (method === 'GET' && url.pathname === '/api/chatkit/threads') {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (method === 'POST' && url.pathname === '/api/chatkit/messages') {
    const body = await request.json()
    
    try {
      // 调用 OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: '你是 LinX 应用的 AI 助手，专门帮助用户管理 Solid Pod 数据和提供技术支持。请用中文回答问题。' },
            { role: 'user', content: body.content || body.text || 'Hello' }
          ],
          stream: false
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const data = await response.json()
      
      // 转换为ChatKit格式的响应
      return new Response(JSON.stringify({
        id: data.id,
        content: data.choices[0]?.message?.content || 'No response',
        role: 'assistant',
        created_at: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
      
    } catch (error) {
      console.error('ChatKit API error:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  return new Response('Not Found', { status: 404 })
}