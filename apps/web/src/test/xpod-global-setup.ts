import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext } from './xpod-integration'

export default async function setupSharedXpodRuntime() {
  const previousConfigPath = process.env.XPOD_TEST_SHARED_CONTEXT_PATH
  delete process.env.XPOD_TEST_SHARED_CONTEXT_PATH

  const context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [],
  })
  if (!context.sharedRuntimeConfig) {
    // External-auth mode already points at a long-lived server.
    process.env.XPOD_TEST_SHARED_CONTEXT_PATH = previousConfigPath
    return async () => {
      await context.stop()
    }
  }

  const configRoot = await mkdtemp(join(tmpdir(), 'linx-xpod-shared-'))
  const configPath = join(configRoot, 'context.json')
  await writeFile(configPath, JSON.stringify(context.sharedRuntimeConfig), {
    encoding: 'utf-8',
    mode: 0o600,
  })
  process.env.XPOD_TEST_SHARED_CONTEXT_PATH = configPath

  return async () => {
    if (previousConfigPath) {
      process.env.XPOD_TEST_SHARED_CONTEXT_PATH = previousConfigPath
    } else {
      delete process.env.XPOD_TEST_SHARED_CONTEXT_PATH
    }
    await context.stop()
    await rm(configRoot, { recursive: true, force: true })
  }
}
