/**
 * 多值问题诊断脚本
 * 
 * 运行: npx tsx scripts/check-multivalue.ts
 */

import { drizzle } from 'drizzle-solid'
import { chatTable, threadTable, messageTable } from '@linx/models'
import { createDpopHeader, generateDpopKeyPair } from '@inrupt/solid-client-authn-core'
import { buildAuthenticatedFetch } from '@inrupt/solid-client-authn-core'
import * as dotenv from 'dotenv'

// 加载 .env
dotenv.config({ path: '../../.env' })

const WEBID = process.env.SOLID_WEBID!
const CLIENT_ID = process.env.SOLID_CLIENT_ID!
const CLIENT_SECRET = process.env.SOLID_CLIENT_SECRET!
const OIDC_ISSUER = process.env.SOLID_OIDC_ISSUER!

async function getAccessToken(): Promise<{ accessToken: string; dpopKey: any }> {
  // 生成 DPoP key pair
  const dpopKey = await generateDpopKeyPair()
  
  // 获取 access token
  const tokenUrl = `${OIDC_ISSUER}/.oidc/token`
  const dpopHeader = await createDpopHeader(tokenUrl, 'POST', dpopKey)
  
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'DPoP': dpopHeader,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  
  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    throw new Error(`获取 token 失败: ${tokenRes.status} ${text}`)
  }
  
  const { access_token } = await tokenRes.json()
  
  return { accessToken: access_token, dpopKey }
}

async function main() {
  console.log('='.repeat(60))
  console.log('drizzle-solid 多值问题诊断')
  console.log('='.repeat(60))
  console.log('')
  console.log(`WebID: ${WEBID}`)
  console.log(`OIDC Issuer: ${OIDC_ISSUER}`)
  console.log('')

  // 1. 获取 access token
  console.log('正在登录 (Bearer + DPoP)...')
  const { accessToken, dpopKey } = await getAccessToken()
  console.log('登录成功')
  console.log('')

  // 2. 创建带 DPoP 认证的 fetch
  const authFetch = await buildAuthenticatedFetch(fetch, accessToken, { dpopKey })
  
  const mockSession = {
    info: {
      isLoggedIn: true,
      webId: WEBID,
      sessionId: 'test-session',
    },
    fetch: authFetch,
  }

  // 3. 创建 drizzle 实例
  const db = drizzle(mockSession as any, {
    logger: false,
  })

  // 4. 检查各表
  const tables = [
    { name: 'chats', table: chatTable },
    { name: 'threads', table: threadTable },
    { name: 'messages', table: messageTable },
  ]

  let hasAnyMultiValue = false

  for (const { name, table } of tables) {
    console.log(`--- 检查 ${name} 表 ---`)
    
    try {
      const rows = await db.select().from(table).execute()
      
      console.log(`  返回行数: ${rows.length}`)
      
      if (rows.length === 0) {
        console.log(`  ✓ 表为空`)
        console.log('')
        continue
      }

      // 按 subject/id 分组
      const bySubject = new Map<string, any[]>()
      for (const row of rows) {
        const subject = (row as any)['@id'] || (row as any).subject || (row as any).id || 'unknown'
        if (!bySubject.has(subject)) {
          bySubject.set(subject, [])
        }
        bySubject.get(subject)!.push(row)
      }
      
      console.log(`  唯一主体数: ${bySubject.size}`)
      
      if (rows.length !== bySubject.size) {
        hasAnyMultiValue = true
        console.log(`  ⚠️  多值问题! 行数(${rows.length}) > 唯一主体数(${bySubject.size})`)
        
        // 找出重复的主体
        let shown = 0
        for (const [subject, subjectRows] of bySubject.entries()) {
          if (subjectRows.length > 1 && shown < 3) {
            shown++
            console.log(`\n  重复主体 #${shown}: ${subject}`)
            console.log(`  出现 ${subjectRows.length} 次`)
            
            // 分析哪些字段有不同值
            const fields = Object.keys(subjectRows[0])
            for (const field of fields) {
              const values = subjectRows.map(r => JSON.stringify(r[field]))
              const uniqueValues = [...new Set(values)]
              
              if (uniqueValues.length > 1) {
                console.log(`    字段 "${field}" 有 ${uniqueValues.length} 个不同值:`)
                uniqueValues.slice(0, 3).forEach(v => {
                  console.log(`      - ${v}`)
                })
              }
            }
          }
        }
      } else {
        console.log(`  ✓ 未检测到多值问题`)
      }
      
    } catch (err: any) {
      console.error(`  ✗ 查询失败: ${err.message}`)
    }
    
    console.log('')
  }

  // 5. 结论
  console.log('='.repeat(60))
  if (hasAnyMultiValue) {
    console.log('结论: ⚠️  存在多值问题，需要修复 drizzle-solid')
  } else {
    console.log('结论: ✓ 未检测到多值问题')
  }
  console.log('='.repeat(60))

  process.exit(0)
}

main().catch(err => {
  console.error('错误:', err)
  process.exit(1)
})
