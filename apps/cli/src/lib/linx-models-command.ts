import type { Argv, CommandModule } from 'yargs'
import { resolveRuntimeTarget } from './runtime-target.js'
import { createLinxPodDataSession } from './linx-pod-data-session-factory.js'
import { FALLBACK_LINX_CLOUD_MODEL_IDS } from './default-model.js'
import type { RemoteAuthFetch } from './chat-api.js'
import type { PodDataSession } from './pod-data-session.js'

type ModelsCommandArgs = {
  url?: string
}

interface ModelsRuntime {
  listRemoteModels(authFetch: RemoteAuthFetch, runtimeUrl: string, options?: { fallback?: boolean; timeoutMs?: number }): Promise<Array<{
    id: string
    provider?: string
    ownedBy?: string
    contextWindow?: number
  }>>
}

interface RuntimeAuthContext {
  runtimeUrl: string
  authFetch: RemoteAuthFetch
  podSession: PodDataSession
  runtime: ModelsRuntime
}

export const modelsCommand: CommandModule<object, ModelsCommandArgs> = {
  command: 'models',
  describe: 'List available remote models',
  builder(command) {
    return command.option('url', { type: 'string', describe: 'Runtime API base URL override' }) as Argv<ModelsCommandArgs>
  },
  async handler(argv) {
    const ctx = await resolveRuntimeAuthContext(argv.url)
    try {
      let models
      try {
        models = await ctx.runtime.listRemoteModels(ctx.authFetch, ctx.runtimeUrl, { fallback: false })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to load cloud models from ${ctx.runtimeUrl}: ${message}`)
      }

      if (models.length === 0) {
        process.stdout.write(`Cloud runtime returned an empty model list.\n`)
      } else {
        for (const model of models) {
          const meta = formatRemoteModelMetadata(model)
          process.stdout.write(`- ${model.id}${meta ? ` (${meta})` : ''}\n`)
        }
      }
    } finally {
      await ctx.podSession.close()
    }
  },
}

function formatRemoteModelMetadata(model: { id: string; provider?: string; ownedBy?: string; contextWindow?: number }): string {
  const provider = resolveRemoteModelProviderLabel(model)
  return [provider, model.contextWindow ? `${model.contextWindow}` : '']
    .filter(Boolean)
    .join(' · ')
}

function resolveRemoteModelProviderLabel(model: { id: string; provider?: string; ownedBy?: string }): string | undefined {
  if (FALLBACK_LINX_CLOUD_MODEL_IDS.includes(model.id as typeof FALLBACK_LINX_CLOUD_MODEL_IDS[number])) {
    return 'undefineds'
  }

  return model.provider || model.ownedBy
}

let modelsRuntimePromise: Promise<ModelsRuntime> | null = null

async function loadModelsRuntime(): Promise<ModelsRuntime> {
  if (!modelsRuntimePromise) {
    modelsRuntimePromise = import('./chat-api.js').then((chatApi) => ({
      listRemoteModels: chatApi.listRemoteModels,
    }))
  }

  return modelsRuntimePromise!
}

async function resolveRuntimeAuthContext(urlOverride?: string): Promise<RuntimeAuthContext> {
  const runtime = await loadModelsRuntime()
  const podSession = await createLinxPodDataSession()
  const target = resolveRuntimeTarget({
    issuerUrl: podSession.credentials.url,
    runtimeUrlOverride: urlOverride,
  })

  return {
    runtimeUrl: target.runtimeUrl,
    authFetch: podSession.runtimeFetch,
    podSession,
    runtime,
  }
}
