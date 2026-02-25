import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Session } from '@inrupt/solid-client-authn-node'
import {
  getSolidDataset,
  getThing,
  getStringNoLocale,
} from '@inrupt/solid-client'
const require = createRequire(import.meta.url)
const drizzleSolid = require('drizzle-solid')
const { drizzle, podTable, string, text, timestamp, uri, boolean } = drizzleSolid

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const createNamespace = (prefix, baseUri, terms) => {
  const builder = ((term) => (ABSOLUTE_IRI.test(term) ? term : `${baseUri}${term}`))
  builder.prefix = prefix
  builder.uri = baseUri
  builder.NAMESPACE = baseUri
  builder.term = (name) => builder(name)
  Object.entries(terms).forEach(([key, value]) => {
    Object.defineProperty(builder, key, {
      value: builder(value),
      enumerable: true,
    })
  })
  return builder
}

const FOAF = createNamespace('foaf', 'http://xmlns.com/foaf/0.1/', { name: 'name', maker: 'maker' })
const DCTerms = createNamespace('dcterms', 'http://purl.org/dc/terms/', {
  title: 'title',
  description: 'description',
  created: 'created',
  modified: 'modified',
  isReplacedBy: 'isReplacedBy',
})
const LINQ = createNamespace('linx', 'https://linx.ai/ns#', {
  aiProvider: 'aiProvider',
  aiModel: 'aiModel',
  systemPrompt: 'systemPrompt',
  favorite: 'favorite',
  lastActiveAt: 'lastActiveAt',
  Contact: 'Contact',
  hasThread: 'hasThread',
  messageType: 'messageType',
  messageStatus: 'messageStatus',
})
const SCHEMA = createNamespace('schema', 'http://schema.org/', {
  participant: 'participant',
  text: 'text',
  dateDeleted: 'dateDeleted',
})
const WF = createNamespace('wf', 'http://www.w3.org/2005/01/wf/flow-1.0#', { message: 'message' })
const MEETING = createNamespace('mee', 'http://www.w3.org/ns/pim/meeting#', {
  LongChat: 'LongChat',
  Message: 'Message',
})
const SIOC = createNamespace('sioc', 'http://rdfs.org/sioc/ns#', {
  Thread: 'Thread',
  has_member: 'has_member',
  content: 'content',
  richContent: 'richContent',
})

const chatTable = podTable(
  'chat',
  {
    title: string('title').predicate(DCTerms.title).notNull(),
    description: string('description').predicate(DCTerms.description),
    provider: string('provider').predicate(LINQ.aiProvider).notNull(),
    model: string('model').predicate(LINQ.aiModel).notNull(),
    systemPrompt: text('systemPrompt').predicate(LINQ.systemPrompt),
    starred: boolean('starred').predicate(LINQ.favorite).default(false),
    participants: uri('participants')
      .array()
      .predicate(SCHEMA.participant)
      .notNull()
      .reference(LINQ.Contact),
    lastActiveAt: timestamp('lastActiveAt').predicate(LINQ.lastActiveAt),
    lastMessageId: uri('lastMessageId').predicate(WF.message),
    lastMessagePreview: text('lastMessagePreview').predicate(SCHEMA.text),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: 'idp:///.data/chats/',
    rdfClass: MEETING.LongChat,
    namespace: LINQ,
  },
)

const threadTable = podTable(
  'thread',
  {
    chatId: uri('chatId')
      .predicate(LINQ.hasThread)
      .inverse()
      .notNull()
      .reference(MEETING.LongChat),
    title: string('title').predicate(DCTerms.title),
    starred: boolean('starred').predicate(LINQ.favorite).default(false),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: 'idp:///.data/threads/',
    rdfClass: SIOC.Thread,
    namespace: LINQ,
  },
)

const messageTable = podTable(
  'chat_message',
  {
    threadId: uri('threadId')
      .predicate(SIOC.has_member)
      .inverse()
      .notNull()
      .reference(SIOC.Thread),
    chatId: uri('chatId')
      .predicate(WF.message)
      .inverse()
      .notNull()
      .reference(MEETING.LongChat),
    maker: uri('maker').predicate(FOAF.maker).notNull().reference(LINQ.Contact),
    role: string('role').predicate(LINQ.messageType).notNull().default('user'),
    content: text('content').predicate(SIOC.content).notNull(),
    richContent: text('richContent').predicate(SIOC.richContent),
    status: string('status').predicate(LINQ.messageStatus).notNull().default('sent'),
    replacedBy: string('replacedBy').predicate(DCTerms.isReplacedBy),
    deletedAt: timestamp('deletedAt').predicate(SCHEMA.dateDeleted),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified),
  },
  {
    base: 'idp:///.data/messages/',
    rdfClass: MEETING.Message,
    namespace: LINQ,
  },
)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf-8')
  raw.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eq = trimmed.indexOf('=')
    if (eq === -1) return
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  })
}

const required = ['WEBID', 'SOLID_CLIENT_ID', 'SOLID_CLIENT_SECRET', 'SOLID_OIDC_ISSUER']
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  console.error('Missing required env vars:', missing.join(', '))
  process.exit(1)
}

const {
  WEBID,
  SOLID_CLIENT_ID,
  SOLID_CLIENT_SECRET,
  SOLID_OIDC_ISSUER,
} = process.env

const run = async () => {
  const session = new Session()
  console.log('🔐 Logging into Solid Pod...')
  await session.login({
    clientId: SOLID_CLIENT_ID,
    clientSecret: SOLID_CLIENT_SECRET,
    oidcIssuer: SOLID_OIDC_ISSUER,
    tokenType: 'DPoP',
  })

  if (!session.info.isLoggedIn) {
    throw new Error('Session login failed')
  }
  console.log('✅ Solid session established for', session.info.webId)

  const profileUrl = WEBID.includes('#') ? WEBID.split('#')[0] : WEBID
  const dataset = await getSolidDataset(profileUrl, { fetch: session.fetch })
  const profile = getThing(dataset, WEBID)
  const displayName = profile ? getStringNoLocale(profile, FOAF.name) : null
  console.log('👤 Profile display name:', displayName ?? '(not set)')

  console.log('🧭 Initialising drizzle-solid connection...')
  const db = drizzle(session, { logger: false })

  try {
    const chats = await db.select().from(chatTable).limit(5).execute()
    console.log(`💬 Retrieved ${chats.length} chats`)
  } catch (error) {
    console.warn('⚠️ Unable to list chats via drizzle-solid:', error)
  }

  try {
    await db.init([chatTable, threadTable, messageTable])
    console.log('📦 Ensured chat/thread/message containers exist')
  } catch (error) {
    console.warn('⚠️ db.init failed:', error)
  }

  await session.logout()
  console.log('👋 Logged out from Solid Pod')
}

run().catch((error) => {
  console.error('❌ Solid Pod smoke test failed:', error)
  process.exit(1)
})
