#!/usr/bin/env node
import {
  getSolidDataset,
  getStringNoLocale,
  getThing,
} from '@inrupt/solid-client'
import {
  applySolidComunicaPatches,
  chatResource,
  drizzle,
  messageResource,
  solidResources,
  threadResource,
} from '../apps/cli/dist/lib/models.js'
import { getDefaultPodDataSession } from '../apps/cli/dist/lib/pod-data-session.js'

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'
const SOLID_AUTH_CREDENTIALS_HINT = '$SOLID_HOME/auth/credentials.json (SOLID_HOME defaults to ~/.solid)'

async function main() {
  const context = await getDefaultPodDataSession()
  if (!context) {
    throw new Error(`No LinX/Solid credentials found at ${SOLID_AUTH_CREDENTIALS_HINT}. Run \`linx login\` first.`)
  }

  applySolidComunicaPatches()

  console.log('🔐 Using unified LinX/Solid login for', context.webId)

  const profileUrl = context.webId.includes('#') ? context.webId.split('#')[0] : context.webId
  const dataset = await getSolidDataset(profileUrl, { fetch: context.fetch })
  const profile = getThing(dataset, context.webId)
  const displayName = profile ? getStringNoLocale(profile, FOAF_NAME) : null
  console.log('👤 Profile display name:', displayName ?? '(not set)')

  console.log('🧭 Initialising drizzle-solid connection...')
  const db = drizzle(context.solidSession, {
    logger: false,
    disableInteropDiscovery: true,
    podUrl: context.podUrl,
    resourcePreparation: 'best-effort',
    schema: solidResources,
  })

  try {
    const chats = await db.select().from(chatResource).limit(5).execute()
    console.log(`💬 Retrieved ${chats.length} chats`)
  } catch (error) {
    console.warn('⚠️ Unable to list chats via drizzle-solid:', error)
  }

  try {
    await db.init([chatResource, threadResource, messageResource])
    console.log('📦 Ensured chat/thread/message containers exist')
  } catch (error) {
    console.warn('⚠️ db.init failed:', error)
  } finally {
    await db.disconnect?.().catch(() => undefined)
    await context.close().catch(() => undefined)
  }

  console.log('👋 Solid Pod smoke completed')
}

main().catch((error) => {
  console.error('❌ Solid Pod smoke test failed:', error)
  process.exit(1)
})
