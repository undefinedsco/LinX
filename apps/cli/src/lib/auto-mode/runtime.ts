import { promptText } from '../prompt.js'
import { createPodDataSession } from '../pod-data-session.js'
import { connectAiProviderCredential } from '../ai-command.js'
import { createRemoteCompletionResult } from '../chat-api.js'
import { preflightAutoModeAuth } from './auth.js'
import { loadPodBackendCredential } from './pod-ai.js'
import {
  createRemoteAutoModeApproval,
  materializeRemoteAutoModeGrant,
  resolveExistingRemoteAutoModeGrant,
  resolveRemoteAutoModeApproval,
  waitForRemoteAutoModeApproval,
} from './pod-approval.js'
import { persistAutoModeConversationToPod } from './pod-persistence.js'
import { resolveAutoModeSecretaryRecommendation } from './secretary.js'

export const autoModeRuntime = {
  promptText,
  preflightAutoModeAuth,
  loadPodBackendCredential,
  connectAiProviderCredential,
  createRemoteAutoModeApproval,
  resolveExistingRemoteAutoModeGrant,
  waitForRemoteAutoModeApproval,
  resolveRemoteAutoModeApproval,
  materializeRemoteAutoModeGrant,
  persistAutoModeConversationToPod,
  resolveAutoModeSecretaryRecommendation,
  createPodDataSession,
  createRemoteCompletionResult,
}
