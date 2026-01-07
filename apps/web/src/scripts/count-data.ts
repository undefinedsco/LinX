// @ts-nocheck
import dotenv from 'dotenv'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle } from 'drizzle-solid'
import {
  chatTable,
  threadTable,
  messageTable,
  contactTable,
  agentTable,
  modelProviderTable,
  linxSchema,
} from '@linx/models'

dotenv.config({ path: '../../.env' })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

async function main() {
  console.log('Connecting to:', env.oidcIssuer)
  
  const session = new Session()
  await session.login({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    oidcIssuer: env.oidcIssuer,
    tokenType: 'DPoP',
  })

  const db = drizzle(session, {
    logger: false,
    disableInteropDiscovery: true,
    schema: linxSchema,
  })

  console.log('\n📊 数据量统计\n')
  console.log('==================================================')

  const tables = [
    { name: 'chats', table: chatTable },
    { name: 'threads', table: threadTable },
    { name: 'messages', table: messageTable },
    { name: 'contacts', table: contactTable },
    { name: 'agents', table: agentTable },
    { name: 'modelProviders', table: modelProviderTable },
  ]

  for (const item of tables) {
    try {
      const start = performance.now()
      const rows = await db.select().from(item.table).execute()
      const elapsed = Math.round(performance.now() - start)
      const paddedName = item.name.padEnd(20)
      const paddedCount = String(rows.length).padStart(5)
      console.log(paddedName + paddedCount + ' 条  (' + elapsed + 'ms)')
    } catch (e) {
      console.log(item.name + ' 查询失败: ' + e)
    }
  }

  console.log('==================================================')
  await session.logout()
  process.exit(0)
}

main().catch(console.error)
