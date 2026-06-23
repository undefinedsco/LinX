import { LoginDialogComponent } from '@earendil-works/pi-coding-agent'
import { connectAiProviderCredential } from './ai-command.js'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { getAIConfigProviderMetadata } from './models.js'
import type { LinxShellCommand } from './linx-shell-command-router.js'
import type {
  BackendCredentialEntry,
  BackendCredentialInput,
  BackendCredentialRepairReason,
} from './backend-credentials.js'

export async function promptForBackendCredential(
  interactive: any,
  details: BackendCredentialInput,
): Promise<BackendCredentialEntry | null | undefined> {
  const reason = details.reason ?? 'missing'
  const repairLabel = formatBackendCredentialRepairReason(reason)
  interactive.showStatus?.(
    `AI Secretary detected ${repairLabel} ${details.providerLabel} credentials before this backend can answer. `
      + 'Enter them here; LinX will save them to your Pod AI settings and retry the message.',
  )

  if (canRenderPiLoginDialog(interactive)) {
    return promptForApiCredentialWithPiDialog(interactive, {
      title: `Connect ${details.providerLabel}`,
      providerId: details.providerId,
      providerLabel: details.providerLabel,
      providerIdPrompt: details.providerIdPrompt,
      apiKeyPrompt: details.apiKeyPrompt,
      baseUrlPrompt: details.baseUrlPrompt,
      progress: [
        `AI Secretary detected ${repairLabel} credentials.`,
        'LinX will save this with `linx ai connect` semantics into your Pod AI settings.',
      ],
      errorPrefix: `Failed to collect ${details.providerLabel} credentials`,
    })
  }

  return promptForBackendCredentialWithExtensionInput(interactive, details, repairLabel)
}

export async function handleInteractiveAiConnectCommand(
  interactive: any,
  runtime: any,
  command: Extract<LinxShellCommand, { action: 'ai-connect' }>,
): Promise<void> {
  const providerId = command.provider?.trim()
  if (!providerId) {
    interactive.showStatus?.('Usage: /ai connect <provider> [--base-url <url>] [--model <model>] - connect an AI provider key to LinX Pod AI settings.')
    interactive.ui?.requestRender?.()
    return
  }

  const metadata = getAIConfigProviderMetadata(providerId)
  const providerLabel = metadata.displayName ?? metadata.id
  const credential = canRenderPiLoginDialog(interactive)
    ? await promptForApiCredentialWithPiDialog(interactive, {
        title: `Connect ${providerLabel}`,
        providerId: metadata.id,
        providerLabel,
        apiKeyPrompt: `${providerLabel} API key`,
        baseUrlPrompt: command.baseUrl ? undefined : 'API base URL',
        progress: [
          `Connect ${providerLabel} with LinX AI connect.`,
          'LinX will save this provider key to your Pod AI settings, not Pi auth.json.',
          ...(command.model ? [`Default model: ${command.model}`] : []),
        ],
        errorPrefix: `Failed to connect ${providerLabel}`,
      })
    : await promptForApiCredentialWithExtensionInput(interactive, {
        providerId: metadata.id,
        providerLabel,
        apiKeyPrompt: `${providerLabel} API key`,
        baseUrlPrompt: command.baseUrl ? undefined : 'API base URL',
        repairLabel: 'connect',
      })

  const apiKey = credential?.apiKey?.trim()
  if (!apiKey) {
    interactive.showStatus?.(`${providerLabel} AI connect cancelled.`)
    interactive.ui?.requestRender?.()
    return
  }

  try {
    const saveCredential = resolveInteractiveAiConnectCredentialSaver(interactive, runtime)
    const credentialProviderId = credential?.providerId?.trim()
    const credentialBaseUrl = credential?.baseUrl?.trim() || command.baseUrl?.trim()
    const model = command.model?.trim()
    const result = await saveCredential({
      provider: credentialProviderId || metadata.id,
      apiKey,
      ...(credentialBaseUrl ? { baseUrl: credentialBaseUrl } : {}),
      ...(model ? { model } : {}),
    })
    interactive.showStatus?.(`Connected AI provider ${result.providerId} to LinX Pod AI settings. api-key: ${result.maskedApiKey}`)
    interactive.session?.modelRegistry?.refresh?.()
    await interactive.updateAvailableProviderCount?.()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showLinxInteractiveError(interactive, `LinX AI connect failed: ${message}`)
  } finally {
    interactive.ui?.requestRender?.()
  }
}

function resolveInteractiveAiConnectCredentialSaver(interactive: any, runtime: any): typeof connectAiProviderCredential {
  const candidates = [
    runtime?.connectAiProviderCredential,
    interactive?.runtime?.connectAiProviderCredential,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate
    }
  }
  return connectAiProviderCredential
}

async function promptForApiCredentialWithPiDialog(
  interactive: any,
  details: {
    title: string
    providerId: string
    providerLabel: string
    providerIdPrompt?: string
    apiKeyPrompt: string
    baseUrlPrompt?: string
    progress?: string[]
    errorPrefix: string
  },
): Promise<BackendCredentialEntry | null | undefined> {
  const dialog = new LoginDialogComponent(
    interactive.ui,
    details.providerId,
    () => undefined,
    details.providerLabel,
    details.title,
  )
  const restoreEditor = (): void => {
    interactive.editorContainer.clear()
    interactive.editorContainer.addChild(interactive.editor)
    interactive.ui?.setFocus?.(interactive.editor)
    interactive.ui?.requestRender?.()
  }

  interactive.editorContainer.clear()
  interactive.editorContainer.addChild(dialog)
  interactive.ui?.setFocus?.(dialog)
  interactive.ui?.requestRender?.()

  try {
    for (const line of details.progress ?? []) {
      dialog.showProgress(line)
    }

    let providerId = details.providerId
    if (details.providerIdPrompt) {
      const providerIdValue = await dialog.showPrompt(
        `Enter ${details.providerIdPrompt}:`,
        details.providerId,
      )
      providerId = typeof providerIdValue === 'string' && providerIdValue.trim()
        ? providerIdValue.trim()
        : details.providerId
    }

    const apiKeyValue = await dialog.showPrompt(`Enter ${details.apiKeyPrompt}:`)
    const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue.trim() : ''
    if (!apiKey) {
      return null
    }

    let baseUrl: string | undefined
    if (details.baseUrlPrompt) {
      const baseUrlValue = await dialog.showPrompt(
        `Enter ${details.baseUrlPrompt} (optional):`,
      )
      baseUrl = typeof baseUrlValue === 'string' && baseUrlValue.trim()
        ? baseUrlValue.trim()
        : undefined
    }

    return { providerId, apiKey, ...(baseUrl ? { baseUrl } : {}) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message !== 'Login cancelled') {
      showLinxInteractiveError(interactive, `${details.errorPrefix}: ${message}`)
    }
    return null
  } finally {
    restoreEditor()
  }
}

function canRenderPiLoginDialog(interactive: any): boolean {
  return Boolean(
    interactive?.isInitialized === true
      && interactive?.ui
      && interactive?.editor
      && typeof interactive?.editorContainer?.clear === 'function'
      && typeof interactive?.editorContainer?.addChild === 'function'
      && typeof interactive?.ui?.setFocus === 'function'
      && typeof interactive?.ui?.requestRender === 'function',
  )
}

async function promptForBackendCredentialWithExtensionInput(
  interactive: any,
  details: BackendCredentialInput,
  repairLabel: string,
): Promise<BackendCredentialEntry | null | undefined> {
  return promptForApiCredentialWithExtensionInput(interactive, {
    providerId: details.providerId,
    providerLabel: details.providerLabel,
    providerIdPrompt: details.providerIdPrompt,
    apiKeyPrompt: details.apiKeyPrompt,
    baseUrlPrompt: details.baseUrlPrompt,
    repairLabel,
  })
}

async function promptForApiCredentialWithExtensionInput(
  interactive: any,
  details: {
    providerId: string
    providerLabel: string
    providerIdPrompt?: string
    apiKeyPrompt: string
    baseUrlPrompt?: string
    repairLabel: string
  },
): Promise<BackendCredentialEntry | null | undefined> {
  const repairLabel = details.repairLabel
  const apiKeyTitle = [
    `${details.providerLabel} ${repairLabel} credential`,
    `Paste an ${details.apiKeyPrompt}; LinX will save it to your Pod AI settings.`,
    'Press Escape to cancel.',
  ].join('\n')

  if (typeof interactive.showExtensionInput !== 'function') {
    showLinxInteractiveError(interactive, `This terminal cannot collect ${details.providerLabel} credentials inside the TUI. Run \`linx ai connect ${details.providerId}\` first.`)
    return null
  }

  let providerId = details.providerId
  if (details.providerIdPrompt) {
    const providerIdTitle = [
      `${details.providerLabel} ${repairLabel} provider`,
      'Enter the provider id to store under /settings/providers/{provider}.ttl.',
      `Default: ${details.providerId}`,
      'Press Escape to cancel.',
    ].join('\n')
    const providerIdValue = await interactive.showExtensionInput(providerIdTitle, details.providerIdPrompt)
    providerId = typeof providerIdValue === 'string' && providerIdValue.trim()
      ? providerIdValue.trim()
      : details.providerId
  }

  const apiKeyValue = await interactive.showExtensionInput(apiKeyTitle, details.apiKeyPrompt)
  const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue.trim() : ''
  if (!apiKey) {
    return null
  }

  let baseUrl: string | undefined
  if (details.baseUrlPrompt) {
    const baseUrlTitle = [
      `${details.providerLabel} ${repairLabel} base URL`,
      'Optional. Leave empty to use the shared provider default.',
      'Press Escape to cancel.',
    ].join('\n')
    const baseUrlValue = await interactive.showExtensionInput(baseUrlTitle, details.baseUrlPrompt)
    baseUrl = typeof baseUrlValue === 'string' && baseUrlValue.trim()
      ? baseUrlValue.trim()
      : undefined
  }

  return { providerId, apiKey, ...(baseUrl ? { baseUrl } : {}) }
}

function formatBackendCredentialRepairReason(reason: BackendCredentialRepairReason): string {
  return reason === 'invalid' ? 'invalid' : 'missing'
}
