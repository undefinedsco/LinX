import { createLinxChatKitAgentCapabilities, linxRuntimeEndpointForBackend } from '@linx/agent-runtime'
import type { AutoModeWorkerBackend, AutoModeBackendHook } from '../types.js'
import { claudeHook } from './claude.js'
import { codebuddyHook } from './codebuddy.js'
import { codexHook } from './codex.js'

type AutoModeAcpWorkerBackend = Exclude<AutoModeWorkerBackend, 'linx'>

const HOOKS: Record<AutoModeAcpWorkerBackend, AutoModeBackendHook> = {
  codex: codexHook,
  claude: claudeHook,
  codebuddy: codebuddyHook,
}

export const linxNativeBackend = {
  backend: 'linx' as const,
  label: 'LinX',
  description: 'Use LinX Cloud/Pi runtime directly; LinX owns auth, model routing, storage, and approval control.',
  capabilities: createLinxChatKitAgentCapabilities({
    protocol: 'linx-cloud',
    canResumeSession: false,
    hasStreaming: false,
    hasToolCalls: false,
    hasApprovals: false,
    hasApprovalOptions: false,
    hasStructuredUserInput: false,
    canInterrupt: true,
    canInjectMessage: false,
    canPause: false,
    canResume: false,
  }),
  endpoint: linxRuntimeEndpointForBackend('linx'),
}

export function getAutoModeHook(backend: AutoModeWorkerBackend): AutoModeBackendHook {
  if (backend === 'linx') {
    throw new Error('LinX native backend does not use an ACP hook')
  }
  return HOOKS[backend]
}

export function getAutoModeBackendLabel(backend: AutoModeWorkerBackend): string {
  if (backend === 'linx') {
    return linxNativeBackend.label
  }
  return HOOKS[backend]?.label ?? backend
}

export function listAutoModeHooks(): AutoModeBackendHook[] {
  return Object.values(HOOKS)
}

export function describeAutoControl(): string {
  return 'Auto off keeps the user driving directly; auto on lets Secretary drive the session and ask when blocked.'
}
