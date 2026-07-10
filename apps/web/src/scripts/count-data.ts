// @ts-nocheck
import dotenv from 'dotenv'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle } from '@undefineds.co/drizzle-solid'
import {
  chatResource,
  threadResource,
  messageResource,
  contactResource,
  agentResource,
  credentialResource,
  aiProviderResource,
  aiModelResource,
  solidSchema,
} from '@undefineds.co/models'

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
    disableInteropDiscovery: true,
    schema: solidSchema,
  })

  console.log('\n📊 数据量统计\n')
  console.log('==================================================')

  const resources = [
    { name: 'chats', resource: chatResource },
    { name: 'threads', resource: threadResource },
    { name: 'messages', resource: messageResource },
    { name: 'contacts', resource: contactResource },
    { name: 'agents', resource: agentResource },
    { name: 'credentials', resource: credentialResource },
    { name: 'aiProviders', resource: aiProviderResource },
    { name: 'aiModels', resource: aiModelResource },
  ]

  for (const item of resources) {
    try {
      const start = performance.now()
      const rows = await db.select().from(item.resource).execute()
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
