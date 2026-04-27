import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  updateDiscoveryModelRegistry,
  type VercelModelCatalogResponse,
} from '../src/discovery/vercel.ts'
import type { DiscoveryRegistry } from '../src/discovery/types.ts'

const DEFAULT_MODEL_IDS: Record<string, string> = {
  openai: 'openai/gpt-4o',
  anthropic: 'anthropic/claude-3.5-sonnet',
  google: 'google/gemini-2.5-pro',
  deepseek: 'deepseek/deepseek-v3.2',
  'x-ai': 'xai/grok-4',
  qwen: 'alibaba/qwen3-max',
  moonshot: 'moonshotai/kimi-k2.5',
  minimax: 'minimax/minimax-m2.5',
  mistral: 'mistral/mistral-medium',
  zhipu: 'zai/glm-5',
}

async function fetchVercelModelCatalog(): Promise<VercelModelCatalogResponse> {
  const response = await fetch('https://ai-gateway.vercel.sh/v1/models')
  if (!response.ok) {
    throw new Error(`Failed to fetch Vercel model catalog: HTTP ${response.status}`)
  }

  return (await response.json()) as VercelModelCatalogResponse
}

function formatDate(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

function usage(): string {
  return [
    'Usage: yarn workspace @undefineds.co/models sync:discovery:vercel [--check|--stdout]',
    '',
    'Options:',
    '  --check   Exit with code 1 when the generated snapshot differs from models.json',
    '  --stdout  Print the generated JSON instead of writing models.json',
    '  --help    Show this message',
  ].join('\n')
}

async function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has('--help')) {
    process.stdout.write(`${usage()}\n`)
    return
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const modelsPath = path.resolve(scriptDir, '../src/discovery/models.json')
  const currentContent = await readFile(modelsPath, 'utf8')
  const currentRegistry = JSON.parse(currentContent) as DiscoveryRegistry
  const upstreamCatalog = await fetchVercelModelCatalog()
  const nextRegistry = updateDiscoveryModelRegistry(
    currentRegistry,
    upstreamCatalog,
    formatDate(),
    DEFAULT_MODEL_IDS,
  )
  const nextContent = `${JSON.stringify(nextRegistry, null, 2)}\n`

  if (args.has('--stdout')) {
    process.stdout.write(nextContent)
    return
  }

  if (args.has('--check')) {
    if (nextContent !== currentContent) {
      process.stderr.write('Discovery snapshot is out of date.\n')
      process.exitCode = 1
      return
    }

    process.stdout.write('Discovery snapshot is up to date.\n')
    return
  }

  await writeFile(`${modelsPath}`, nextContent, 'utf8')

  const upstreamCount = Array.isArray(upstreamCatalog.data) ? upstreamCatalog.data.length : 0
  const syncedCount = nextRegistry.models.length
  process.stdout.write(
    `Updated discovery models from Vercel: upstream=${upstreamCount}, snapshot=${syncedCount}, updatedAt=${nextRegistry.updatedAt}\n`,
  )
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
