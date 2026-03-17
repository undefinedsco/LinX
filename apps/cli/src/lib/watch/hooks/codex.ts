import type { WatchBackendHook } from '../types.js'
import { parseJsonProtocolLine } from './shared.js'

export const codexHook: WatchBackendHook = {
  id: 'codex',
  label: 'Codex',
  description: 'Use local codex app-server transport for persistent multi-turn sessions.',
  sessionKind: 'persistent-process',
  buildSpawnPlan(options) {
    return {
      command: 'codex',
      args: ['app-server', '--listen', 'stdio://', ...options.passthroughArgs],
    }
  },
  parseLine(line) {
    return parseJsonProtocolLine(line)
  },
}
