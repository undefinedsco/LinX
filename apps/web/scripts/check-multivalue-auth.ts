/**
 * 检查 drizzle-solid 多值问题诊断脚本（带认证）
 * 
 * 运行方式: npx tsx scripts/check-multivalue-auth.ts
 */

import { login, getDefaultSession } from '@inrupt/solid-client-authn-node'

const IDENTITY_PROVIDER = 'http://localhost:3000/'
const EMAIL = process.env.TEST_EMAIL || '63005737@qq.com'
const PASSWORD = process.env.TEST_PASSWORD || 'ganlu1988'

async function getAuthenticatedFetch() {
  const session = getDefaultSession()
  
  if (!session.info.isLoggedIn) {
    console.log('Logging in...')
    await login({
      oidcIssuer: IDENTITY_PROVIDER,
      clientName: 'multivalue-check',
      // @ts-ignore - using password auth for local testing
      email: EMAIL,
      password: PASSWORD,
    })
  }
  
  return session.fetch
}

async function sparqlQuery(endpoint: string, query: string, fetchFn: typeof fetch) {
  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-query',
      'Accept': 'application/sparql-results+json',
    },
    body: query,
  })
  
  if (!response.ok) {
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`)
  }
  
  return response.json()
}

async function checkMultiValueIssue() {
  console.log('='.repeat(60))
  console.log('drizzle-solid 多值问题诊断（带认证）')
  console.log('='.repeat(60))
  console.log('')

  try {
    const authFetch = await getAuthenticatedFetch()
    console.log('认证成功\n')

    const endpoints = [
      { name: 'chats', url: 'http://localhost:3000/ganlu/.data/chat/-/sparql' },
      { name: 'threads', url: 'http://localhost:3000/ganlu/.data/chat/-/sparql' },
      { name: 'messages', url: 'http://localhost:3000/ganlu/.data/chat/-/sparql' },
    ]

    // 查询多值的 SPARQL
    const query = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      SELECT ?subject ?modified WHERE {
        ?subject dcterms:modified ?modified .
      }
      ORDER BY ?subject
    `

    for (const { name, url } of endpoints) {
      console.log(`\n--- 检查 ${name} 表的 dcterms:modified ---`)
      console.log(`Endpoint: ${url}`)
      
      try {
        const result = await sparqlQuery(url, query, authFetch as typeof fetch)
        const bindings = result?.results?.bindings || []
        
        console.log(`  返回绑定数: ${bindings.length}`)
        
        if (bindings.length === 0) {
          console.log(`  ✓ 表为空或无 modified 字段`)
          continue
        }
        
        // 按 subject 分组
        const bySubject = new Map<string, string[]>()
        for (const binding of bindings) {
          const subject = binding.subject?.value || 'unknown'
          const modified = binding.modified?.value || 'unknown'
          
          if (!bySubject.has(subject)) {
            bySubject.set(subject, [])
          }
          bySubject.get(subject)!.push(modified)
        }
        
        console.log(`  唯一主体数: ${bySubject.size}`)
        
        // 检查多值
        let hasMultiValue = false
        for (const [subject, values] of bySubject.entries()) {
          if (values.length > 1) {
            hasMultiValue = true
            console.log(`  ⚠️  多值问题! ${subject}:`)
            values.forEach(v => console.log(`      - ${v}`))
          }
        }
        
        if (!hasMultiValue) {
          console.log(`  ✓ 未检测到多值问题`)
        }
        
      } catch (err: any) {
        console.log(`  ✗ 查询失败: ${err.message}`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('诊断完成')
    console.log('='.repeat(60))

  } catch (err: any) {
    console.error('错误:', err.message)
    process.exit(1)
  }
}

// 运行诊断
checkMultiValueIssue().catch(console.error)
