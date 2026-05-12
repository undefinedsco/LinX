import type { CommandModule } from 'yargs'
import { resolveLinxPodUrl } from '@undefineds.co/models/client'
import {
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  getAIConfigProviderFamilyIds,
  getAIConfigProviderMetadata,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  sameAIConfigProviderFamily,
} from '@undefineds.co/models/ai-config'
import { XPOD_AI, XPOD_CREDENTIAL } from '@undefineds.co/models/namespaces'
import { getClientCredentialId, getClientCredentialKey, getClientCredentials, loadCredentials } from './credentials-store.js'
import { loadAccountSession } from './account-session.js'
import { authenticatedFetch, getAccessToken } from './solid-auth.js'
import { getOidcAccessToken } from './oidc-auth.js'
import { promptPassword } from './prompt.js'
import {
  firstIri,
  firstLiteral,
  parseManagedTurtleBlocks,
  subjectIdFromResourceUrl,
} from './pi-adapter/pod-native.js'

interface AiArgs {
  action?: 'connect' | 'disconnect' | 'status'
  provider?: string
  url?: string
  'api-key'?: string
  model?: string
  'base-url'?: string
}

interface ParsedCredentialRow extends Record<string, unknown> {
  id: string
  provider?: string
  service?: string
  status?: string
  apiKey?: string
  baseUrl?: string
  label?: string
}

interface ParsedProviderRow extends Record<string, unknown> {
  id: string
  baseUrl?: string
  proxyUrl?: string
  hasModel?: string
}

interface ParsedModelRow extends Record<string, unknown> {
  id: string
  displayName?: string
  modelType?: string
  isProvidedBy?: string
  status?: string
}

interface AiRuntime {
  XPOD_AI: typeof XPOD_AI
  XPOD_CREDENTIAL: typeof XPOD_CREDENTIAL
  buildAIConfigMutationPlan: (input: {
    providerId: string
    currentProviderRows: ParsedProviderRow[]
    currentCredentialRows: ParsedCredentialRow[]
    currentModelRows: ParsedModelRow[]
    updates: {
      enabled?: boolean
      apiKey?: string
      baseUrl?: string
      models?: Array<{
        id: string
        name: string
        enabled: boolean
        capabilities: string[]
      }>
    }
  }) => {
    providerId: string
    providerPayload?: {
      id?: string
      baseUrl?: string
      proxyUrl?: string
      hasModel?: string
    }
    credentialPayload?: {
      id?: string
      provider?: string
      service?: string
      status?: string
      apiKey?: string
      baseUrl?: string
      label?: string
    }
    modelUpserts: Array<{
      id?: string
      displayName?: string
      modelType?: string
      isProvidedBy?: string
      status?: string
      createdAt?: Date
      updatedAt?: Date
    }>
  }
  buildAIConfigProviderStateMap: (input: {
    fallbackToCatalogModels?: boolean
    credentialRows: ParsedCredentialRow[]
    providerRows: ParsedProviderRow[]
    modelRows: ParsedModelRow[]
  }) => Record<string, {
    id: string
    apiKey?: string
    selectedModelId?: string
  }>
  getAIConfigProviderFamilyIds: (providerId: string) => string[]
  getAIConfigProviderMetadata: (providerId: string) => { id: string }
  normalizeAIConfigProviderId: (value?: string | null) => string
  normalizeAIConfigResourceId: (value?: string | null) => string
  sameAIConfigProviderFamily: (left?: string | null, right?: string | null) => boolean
}

const XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime'

let aiRuntimePromise: Promise<AiRuntime> | null = null

async function loadAiRuntime(): Promise<AiRuntime> {
  if (!aiRuntimePromise) {
    aiRuntimePromise = Promise.resolve({
      XPOD_AI,
      XPOD_CREDENTIAL,
      buildAIConfigMutationPlan,
      buildAIConfigProviderStateMap,
      getAIConfigProviderFamilyIds,
      getAIConfigProviderMetadata,
      normalizeAIConfigProviderId,
      normalizeAIConfigResourceId,
      sameAIConfigProviderFamily,
    })
  }

  return aiRuntimePromise!
}

function maskSecret(value: string): string {
  if (value.length <= 8) return '****'
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

function absolutePodUri(podUrl: string, relativePath: string): string {
  return `${podUrl.replace(/\/?$/, '/')}${relativePath.replace(/^\/+/, '')}`
}

function resourceFragmentIri(resourceUrl: string, fragmentId: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(fragmentId)) {
    return fragmentId
  }
  return `${resourceUrl}#${fragmentId}`
}

function resourceRefIri(podUrl: string, resourceUrl: string, ref: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(ref)) {
    return ref
  }
  if (ref.startsWith('/')) {
    return absolutePodUri(podUrl, ref)
  }
  if (ref.startsWith('#')) {
    return `${resourceUrl}${ref}`
  }
  return `${resourceUrl}#${ref}`
}

function aiModelResourcePath(providerId: string): string {
  return `/settings/ai/models/${normalizeAIConfigProviderId(providerId)}.ttl`
}

function aiModelResourceUrl(podUrl: string, providerId: string): string {
  return absolutePodUri(podUrl, aiModelResourcePath(providerId))
}

function quoteLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

function dateTimeLiteral(value: Date): string {
  return `"${value.toISOString()}"^^<${XSD_DATE_TIME}>`
}

function parseCredentialRows(turtle: string, resourceUrl: string, runtime: AiRuntime): ParsedCredentialRow[] {
  return [...parseManagedTurtleBlocks(turtle, resourceUrl)]
    .map(([subject, predicates]) => {
      return {
        id: subjectIdFromResourceUrl(subject),
        provider: firstIri(predicates, runtime.XPOD_CREDENTIAL.provider),
        service: firstLiteral(predicates, runtime.XPOD_CREDENTIAL.service),
        status: firstLiteral(predicates, runtime.XPOD_CREDENTIAL.status),
        apiKey: firstLiteral(predicates, runtime.XPOD_CREDENTIAL.apiKey),
        baseUrl: firstLiteral(predicates, runtime.XPOD_CREDENTIAL.baseUrl),
        label: firstLiteral(predicates, runtime.XPOD_CREDENTIAL.label),
      }
    })
    .filter((row) => row.id) as ParsedCredentialRow[]
}

function parseProviderRows(turtle: string, resourceUrl: string, runtime: AiRuntime): ParsedProviderRow[] {
  return [...parseManagedTurtleBlocks(turtle, resourceUrl)]
    .map(([subject, predicates]) => {
      return {
        id: subjectIdFromResourceUrl(subject),
        '@id': subject,
        baseUrl: firstLiteral(predicates, runtime.XPOD_AI.baseUrl),
        proxyUrl: firstLiteral(predicates, runtime.XPOD_AI.proxyUrl),
        hasModel: firstIri(predicates, runtime.XPOD_AI.hasModel),
      }
    })
    .filter((row) => row.id) as ParsedProviderRow[]
}

function parseModelRows(turtle: string, resourceUrl: string, runtime: AiRuntime): ParsedModelRow[] {
  return [...parseManagedTurtleBlocks(turtle, resourceUrl)]
    .map(([subject, predicates]) => {
      return {
        id: subjectIdFromResourceUrl(subject),
        displayName: firstLiteral(predicates, runtime.XPOD_AI.displayName),
        modelType: firstLiteral(predicates, runtime.XPOD_AI.modelType),
        isProvidedBy: firstIri(predicates, runtime.XPOD_AI.isProvidedBy),
        status: firstLiteral(predicates, runtime.XPOD_AI.status),
      }
    })
    .filter((row) => row.id) as ParsedModelRow[]
}

async function requireApiKey(argv: AiArgs): Promise<string> {
  if (argv['api-key']?.trim()) {
    return argv['api-key'].trim()
  }

  const apiKey = await promptPassword('API key: ')
  if (!apiKey) {
    throw new Error('API key is required')
  }

  return apiKey
}

async function resolvePodWriteContext(urlOverride?: string): Promise<{ accessToken: string; podUrl: string }> {
  const creds = loadCredentials()
  if (!creds) {
    throw new Error('No local client credentials found. Run `linx login` first.')
  }

  const clientCreds = getClientCredentials(creds)
  let accessToken: string | null = null
  if (clientCreds) {
    const baseUrl = (urlOverride ?? creds.url).replace(/\/?$/, '/')
    const tokenResult = await getAccessToken(getClientCredentialId(clientCreds), getClientCredentialKey(clientCreds), baseUrl)
    accessToken = tokenResult?.accessToken ?? null
  } else {
    accessToken = await getOidcAccessToken(creds)
  }

  if (!accessToken) {
    throw new Error('Failed to obtain Pod access token. Run `linx login` again.')
  }

  return {
    accessToken,
    podUrl: loadAccountSession()?.podUrl || resolveLinxPodUrl(creds.webId),
  }
}

async function patchResource(resourceUrl: string, accessToken: string, body: string): Promise<void> {
  const res = await authenticatedFetch(resourceUrl, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/sparql-update' },
    body,
  })

  if (!res.ok) {
    throw new Error(`Failed to update ${resourceUrl}.`)
  }
}

async function fetchResourceText(resourceUrl: string, accessToken: string): Promise<string> {
  const res = await authenticatedFetch(resourceUrl, accessToken, {
    headers: { Accept: 'text/turtle' },
  })

  if (res.status === 404) {
    return ''
  }

  if (!res.ok) {
    throw new Error(`Failed to read ${resourceUrl}.`)
  }

  return res.text()
}

function buildProviderSparql(runtime: AiRuntime, podUrl: string, resourceUrl: string, payload: {
  id: string
  baseUrl?: string
  proxyUrl?: string
  hasModel?: string
}): string {
  const subject = `<${resourceUrl}#${payload.id}>`
  const deletes = [
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.baseUrl}> ?oldBaseUrl }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.proxyUrl}> ?oldProxyUrl }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.hasModel}> ?oldHasModel }`,
  ]
  const inserts = [`${subject} a <${runtime.XPOD_AI.Provider}> .`]

  if (payload.baseUrl) {
    inserts.push(`${subject} <${runtime.XPOD_AI.baseUrl}> ${quoteLiteral(payload.baseUrl)} .`)
  }
  if (payload.proxyUrl) {
    inserts.push(`${subject} <${runtime.XPOD_AI.proxyUrl}> ${quoteLiteral(payload.proxyUrl)} .`)
  }
  if (payload.hasModel) {
    inserts.push(`${subject} <${runtime.XPOD_AI.hasModel}> <${resourceRefIri(podUrl, resourceUrl, payload.hasModel)}> .`)
  }

  return `DELETE {
  ${subject} <${runtime.XPOD_AI.baseUrl}> ?oldBaseUrl .
  ${subject} <${runtime.XPOD_AI.proxyUrl}> ?oldProxyUrl .
  ${subject} <${runtime.XPOD_AI.hasModel}> ?oldHasModel .
}
INSERT {
  ${inserts.join('\n  ')}
}
WHERE {
  ${deletes.join('\n  ')}
}`
}

function buildCredentialSparql(runtime: AiRuntime, resourceUrl: string, providerResourceUrl: string, payload: {
  id: string
  provider: string
  service: string
  status: string
  apiKey?: string
  baseUrl?: string
  label?: string
}): string {
  const subject = `<${resourceUrl}#${payload.id}>`
  const deletes = [
    `OPTIONAL { ${subject} <${runtime.XPOD_CREDENTIAL.provider}> ?oldProvider }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_CREDENTIAL.service}> ?oldService }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_CREDENTIAL.status}> ?oldStatus }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_CREDENTIAL.apiKey}> ?oldApiKey }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_CREDENTIAL.baseUrl}> ?oldBaseUrl }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_CREDENTIAL.label}> ?oldLabel }`,
  ]
  const inserts = [
    `${subject} a <${runtime.XPOD_CREDENTIAL.Credential}> .`,
    `${subject} <${runtime.XPOD_CREDENTIAL.provider}> <${resourceFragmentIri(providerResourceUrl, payload.provider)}> .`,
    `${subject} <${runtime.XPOD_CREDENTIAL.service}> ${quoteLiteral(payload.service)} .`,
    `${subject} <${runtime.XPOD_CREDENTIAL.status}> ${quoteLiteral(payload.status)} .`,
  ]

  if (payload.apiKey) {
    inserts.push(`${subject} <${runtime.XPOD_CREDENTIAL.apiKey}> ${quoteLiteral(payload.apiKey)} .`)
  }
  if (payload.baseUrl) {
    inserts.push(`${subject} <${runtime.XPOD_CREDENTIAL.baseUrl}> ${quoteLiteral(payload.baseUrl)} .`)
  }
  if (payload.label) {
    inserts.push(`${subject} <${runtime.XPOD_CREDENTIAL.label}> ${quoteLiteral(payload.label)} .`)
  }

  return `DELETE {
  ${subject} <${runtime.XPOD_CREDENTIAL.provider}> ?oldProvider .
  ${subject} <${runtime.XPOD_CREDENTIAL.service}> ?oldService .
  ${subject} <${runtime.XPOD_CREDENTIAL.status}> ?oldStatus .
  ${subject} <${runtime.XPOD_CREDENTIAL.apiKey}> ?oldApiKey .
  ${subject} <${runtime.XPOD_CREDENTIAL.baseUrl}> ?oldBaseUrl .
  ${subject} <${runtime.XPOD_CREDENTIAL.label}> ?oldLabel .
}
INSERT {
  ${inserts.join('\n  ')}
}
WHERE {
  ${deletes.join('\n  ')}
}`
}

function buildModelSparql(runtime: AiRuntime, resourceUrl: string, providerResourceUrl: string, payload: {
  id: string
  displayName?: string
  modelType?: string
  isProvidedBy: string
  status?: string
  createdAt: Date
  updatedAt: Date
}): string {
  const subject = `<${resourceUrl}#${payload.id}>`
  const deletes = [
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.displayName}> ?oldDisplayName }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.modelType}> ?oldModelType }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.isProvidedBy}> ?oldIsProvidedBy }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.status}> ?oldStatus }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.createdAt}> ?oldCreatedAt }`,
    `OPTIONAL { ${subject} <${runtime.XPOD_AI.updatedAt}> ?oldUpdatedAt }`,
  ]
  const inserts = [
    `${subject} a <${runtime.XPOD_AI.Model}> .`,
    `${subject} <${runtime.XPOD_AI.displayName}> ${quoteLiteral(payload.displayName || payload.id)} .`,
    `${subject} <${runtime.XPOD_AI.modelType}> ${quoteLiteral(payload.modelType || 'chat')} .`,
    `${subject} <${runtime.XPOD_AI.isProvidedBy}> <${resourceFragmentIri(providerResourceUrl, payload.isProvidedBy)}> .`,
    `${subject} <${runtime.XPOD_AI.status}> ${quoteLiteral(payload.status || 'active')} .`,
    `${subject} <${runtime.XPOD_AI.createdAt}> ${dateTimeLiteral(payload.createdAt)} .`,
    `${subject} <${runtime.XPOD_AI.updatedAt}> ${dateTimeLiteral(payload.updatedAt)} .`,
  ]

  return `DELETE {
  ${subject} <${runtime.XPOD_AI.displayName}> ?oldDisplayName .
  ${subject} <${runtime.XPOD_AI.modelType}> ?oldModelType .
  ${subject} <${runtime.XPOD_AI.isProvidedBy}> ?oldIsProvidedBy .
  ${subject} <${runtime.XPOD_AI.status}> ?oldStatus .
  ${subject} <${runtime.XPOD_AI.createdAt}> ?oldCreatedAt .
  ${subject} <${runtime.XPOD_AI.updatedAt}> ?oldUpdatedAt .
}
INSERT {
  ${inserts.join('\n  ')}
}
WHERE {
  ${deletes.join('\n  ')}
}`
}

function buildCredentialDeleteSparql(runtime: AiRuntime, providerRef: string): string {
  return `DELETE {
  ?credential ?predicate ?object .
}
WHERE {
  ?credential <${runtime.XPOD_CREDENTIAL.provider}> <${providerRef}> ;
    ?predicate ?object .
}`
}

export const aiCommand: CommandModule<object, AiArgs> = {
  command: 'ai <action> [provider]',
  describe: 'Manage LinX cloud AI provider credentials',
  builder: (yargs) =>
    yargs
      .positional('action', {
        type: 'string',
        choices: ['connect', 'disconnect', 'status'] as const,
      })
      .positional('provider', {
        type: 'string',
        description: 'Provider/backend id, for example claude, anthropic, codebuddy, codex',
      })
      .option('url', { type: 'string', description: 'Server base URL override' })
      .option('api-key', { type: 'string', description: 'Provider API key' })
      .option('model', { type: 'string', description: 'Default model id' })
      .option('base-url', { type: 'string', description: 'Provider API base URL override' }),
  handler: async (argv) => {
    const action = argv.action
    const aiRuntime = await loadAiRuntime()
    const { accessToken, podUrl } = await resolvePodWriteContext(argv.url)
    const providerResource = absolutePodUri(podUrl, '/settings/ai/providers.ttl')
    const credentialResource = absolutePodUri(podUrl, '/settings/credentials.ttl')

    if (action === 'status') {
      const [credentialTurtle, providerTurtle] = await Promise.all([
        fetchResourceText(credentialResource, accessToken),
        fetchResourceText(providerResource, accessToken),
      ])
      const credentialRows = parseCredentialRows(credentialTurtle, credentialResource, aiRuntime)
      const providerRows = parseProviderRows(providerTurtle, providerResource, aiRuntime)
      const requestedProvider = argv.provider ? aiRuntime.normalizeAIConfigProviderId(argv.provider) : ''
      const modelProviderIds = new Set<string>()
      if (requestedProvider) {
        modelProviderIds.add(requestedProvider)
      } else {
        for (const row of providerRows) {
          const providerId = aiRuntime.normalizeAIConfigProviderId(row.id)
          if (providerId) modelProviderIds.add(providerId)
        }
        for (const row of credentialRows) {
          const providerId = aiRuntime.normalizeAIConfigProviderId(String(row.provider ?? row.id ?? ''))
          if (providerId) modelProviderIds.add(providerId)
        }
      }
      const modelRows = (await Promise.all([...modelProviderIds].map(async (providerId) => {
        const resourceUrl = aiModelResourceUrl(podUrl, providerId)
        const turtle = await fetchResourceText(resourceUrl, accessToken)
        return parseModelRows(turtle, resourceUrl, aiRuntime)
      }))).flat()

      const states = aiRuntime.buildAIConfigProviderStateMap({
        fallbackToCatalogModels: false,
        credentialRows,
        providerRows,
        modelRows,
      })

      const filtered = Object.values(states).filter((state) => {
        if (!state.apiKey) return false
        if (!argv.provider) return true
        return aiRuntime.sameAIConfigProviderFamily(argv.provider, state.id)
      })

      if (filtered.length === 0) {
        process.stdout.write('No LinX cloud AI credentials found.\n')
        return
      }

      const lines: string[] = []
      for (const state of filtered) {
        lines.push(`provider: ${state.id}`)
        if (state.selectedModelId) {
          lines.push(`model: ${state.selectedModelId}`)
        }
        lines.push(`api-key: ${maskSecret(state.apiKey!)}`)
        lines.push('')
      }

      process.stdout.write(`${lines.join('\n').trimEnd()}\n`)
      return
    }

    const providerArg = argv.provider?.trim()
    if (!providerArg) {
      throw new Error(action === 'disconnect'
        ? 'Usage: linx ai disconnect <provider>'
        : 'Usage: linx ai connect <provider> --api-key <key>')
    }

    const provider = aiRuntime.normalizeAIConfigProviderId(providerArg)

    if (action === 'disconnect') {
      const providerRefs = aiRuntime.getAIConfigProviderFamilyIds(provider).map((providerId) =>
        resourceFragmentIri(providerResource, providerId),
      )

      for (const providerRef of providerRefs) {
        await patchResource(credentialResource, accessToken, buildCredentialDeleteSparql(aiRuntime, providerRef))
      }

      process.stdout.write(`Disconnected AI provider: ${provider}\n`)
      return
    }

    const apiKey = await requireApiKey(argv)
    const modelId = argv.model?.trim()
    const plan = aiRuntime.buildAIConfigMutationPlan({
      providerId: provider,
      currentProviderRows: [],
      currentCredentialRows: [],
      currentModelRows: [],
      updates: {
        enabled: true,
        apiKey,
        baseUrl: argv['base-url']?.trim() || undefined,
        models: modelId
          ? [{
              id: modelId,
              name: modelId,
              enabled: true,
              capabilities: [],
            }]
          : undefined,
      },
    })

    if (plan.providerPayload?.id) {
      await patchResource(
        providerResource,
        accessToken,
        buildProviderSparql(aiRuntime, podUrl, providerResource, {
          id: plan.providerPayload.id,
          baseUrl: plan.providerPayload.baseUrl,
          proxyUrl: plan.providerPayload.proxyUrl,
          hasModel: plan.providerPayload.hasModel,
        }),
      )
    }

    if (
      plan.credentialPayload?.id
      && plan.credentialPayload.provider
      && plan.credentialPayload.service
      && plan.credentialPayload.status
    ) {
      await patchResource(
        credentialResource,
        accessToken,
        buildCredentialSparql(aiRuntime, credentialResource, providerResource, {
          id: plan.credentialPayload.id,
          provider: plan.credentialPayload.provider,
          service: plan.credentialPayload.service,
          status: plan.credentialPayload.status,
          apiKey: plan.credentialPayload.apiKey,
          baseUrl: plan.credentialPayload.baseUrl,
          label: plan.credentialPayload.label,
        }),
      )
    }

    for (const modelPayload of plan.modelUpserts) {
      if (!modelPayload.id || !modelPayload.isProvidedBy || !modelPayload.createdAt || !modelPayload.updatedAt) {
        continue
      }
      const modelProvider = aiRuntime.normalizeAIConfigProviderId(modelPayload.isProvidedBy)
      const modelResource = aiModelResourceUrl(podUrl, modelProvider || plan.providerId)
      await patchResource(
        modelResource,
        accessToken,
        buildModelSparql(aiRuntime, modelResource, providerResource, {
          id: modelPayload.id,
          displayName: modelPayload.displayName,
          modelType: modelPayload.modelType,
          isProvidedBy: modelPayload.isProvidedBy,
          status: modelPayload.status,
          createdAt: modelPayload.createdAt,
          updatedAt: modelPayload.updatedAt,
        }),
      )
    }

    const metadata = aiRuntime.getAIConfigProviderMetadata(provider)
    process.stdout.write(`Connected AI provider: ${metadata.id}\n`)
    if (modelId) {
      process.stdout.write(`model: ${aiRuntime.normalizeAIConfigResourceId(modelId)}\n`)
    }
    process.stdout.write(`api-key: ${maskSecret(apiKey)}\n`)
  },
}
