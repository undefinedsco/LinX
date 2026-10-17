import { create } from 'zustand'

/**
 * "登录成功但 LinX 没准备好" (S6b): the account and space are fine, only the
 * assistant's home in the space could not be created. Whoever sets the
 * assistant up (providers/pod-collections-bootstrap) reports the failure here;
 * the login overlay then shows one screen with 重试 / 换个空间.
 */
export interface AssistantSetupFailure {
  /** Technical line for "详情", e.g. "创建 .data/agents/ 失败：HTTP 403". */
  detail?: string | null
  /** Runs the setup again; the failure clears when it is called. */
  retry?: () => void
}

interface AssistantSetupState {
  failure: AssistantSetupFailure | null
  report: (failure: AssistantSetupFailure) => void
  clear: () => void
}

export const useAssistantSetupStore = create<AssistantSetupState>((set) => ({
  failure: null,
  report: (failure) => set({ failure }),
  clear: () => set({ failure: null }),
}))

export function reportAssistantSetupFailure(failure: AssistantSetupFailure) {
  useAssistantSetupStore.getState().report(failure)
}

export function clearAssistantSetupFailure() {
  useAssistantSetupStore.getState().clear()
}
