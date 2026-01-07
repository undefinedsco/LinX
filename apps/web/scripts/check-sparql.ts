import 'dotenv/config'
import { drizzle } from 'drizzle-solid'
import { messageTable } from '../../../packages/models/src/message.schema'

// 模拟 Inrupt session
const mockSession = {
  info: {
    isLoggedIn: true,
    webId: 'http://localhost:3000/test/profile/card#me',
    sessionId: 'test-session'
  },
  fetch: async (url: string, options?: any) => {
    console.log('\n=== SPARQL Request ===')
    console.log('URL:', url)
    console.log('Method:', options?.method || 'GET')
    if (options?.headers) {
      console.log('Headers:', JSON.stringify(options.headers, null, 2))
    }
    if (options?.body) {
      console.log('Body:\n', options.body)
    }
    console.log('======================\n')
    
    // 返回空响应
    return new Response('{"head":{"vars":[]},"results":{"bindings":[]}}', {
      status: 200,
      headers: { 'Content-Type': 'application/sparql-results+json' }
    })
  }
}

async function main() {
  const db = drizzle(mockSession as any, {
    schema: { messageTable },
  })

  console.log('Testing SELECT query...')
  try {
    const results = await db.select().from(messageTable).limit(3).execute()
    console.log('Results:', results)
  } catch (e) {
    console.log('Error:', e)
  }
}

main().catch(console.error)
