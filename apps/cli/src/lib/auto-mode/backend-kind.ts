import type {
  AutoModeSessionRecord,
  AutoModeWorkerBackend,
  AutoRunOptions,
} from './types.js'

export function defaultAutoModeApprovalStrategy(): 'hybrid' {
  return 'hybrid'
}

export function resolveApprovalStrategy(
  options: Pick<AutoRunOptions, 'approvalStrategy'>,
): AutoModeSessionRecord['approvalSource'] {
  return options.approvalStrategy ?? defaultAutoModeApprovalStrategy()
}

export function isAutoModeWorkerBackend(
  backend: AutoModeSessionRecord['backend'],
): backend is AutoModeWorkerBackend {
  return backend === 'linx' || backend === 'codex' || backend === 'claude' || backend === 'codebuddy'
}

export function isAcpAutoModeWorkerBackend(
  backend: AutoModeWorkerBackend,
): backend is Exclude<AutoModeWorkerBackend, 'linx'> {
  return backend === 'codex' || backend === 'claude' || backend === 'codebuddy'
}
