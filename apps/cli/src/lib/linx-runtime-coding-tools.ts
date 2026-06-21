import {
  type BashOperations,
  createCodingTools,
  createLocalBashOperations,
} from '@earendil-works/pi-coding-agent'

export const DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS = 15

export function createLinxPiCodingTools(cwd: string, options: {
  bashTimeoutSeconds?: number
  bashOperations?: BashOperations
} = {}): Array<{
  name: string
  execute(callId: string, input: Record<string, unknown>): Promise<unknown>
}> {
  const localBashOperations = options.bashOperations ?? createLocalBashOperations()
  const bashTimeoutSeconds = options.bashTimeoutSeconds ?? DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS
  return createCodingTools(cwd, {
    bash: {
      operations: {
        exec(command, workingDirectory, options) {
          return localBashOperations.exec(command, workingDirectory ?? cwd, {
            ...options,
            timeout: typeof options.timeout === 'number'
              ? options.timeout
              : bashTimeoutSeconds,
          })
        },
      },
    },
  })
}
