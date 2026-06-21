import type { Argv, CommandModule } from 'yargs'
import { createCodexNativeProxy } from './codex-plugin/codex-native-proxy.js'
import { createSymphonyCodexMcpServer } from './codex-plugin/symphony-mcp.js'

type CodexNativeProxyCommandArgs = {
  cwd?: string
  model?: string
  port: number
}

export const symphonyCodexMcpCommand: CommandModule<object, object> = {
  command: 'symphony-codex-mcp',
  describe: false,
  builder(command) {
    return command
  },
  async handler() {
    const server = createSymphonyCodexMcpServer()
    const exitCode = await server.run()
    process.exit(exitCode)
  },
}

export const codexNativeProxyCommand: CommandModule<object, CodexNativeProxyCommandArgs> = {
  command: 'codex-native-proxy',
  describe: false,
  builder(command) {
    return command
      .option('cwd', {
        type: 'string',
        describe: 'Workspace path exposed to the native Codex shell',
      })
      .option('model', {
        type: 'string',
        describe: 'Model override forwarded to the native proxy session metadata',
      })
      .option('port', {
        type: 'number',
        default: 8787,
        describe: 'Local websocket listen port for codex --remote',
      }) as Argv<CodexNativeProxyCommandArgs>
  },
  async handler(argv) {
    const proxy = createCodexNativeProxy({
      cwd: argv.cwd || process.cwd(),
      model: argv.model,
      listenPort: argv.port,
    })

    await proxy.start()
    process.stdout.write(`[linx] native codex proxy ready\n`)
    process.stdout.write(`[linx] connect with: codex --remote ${proxy.remoteUrl} -C ${proxy.record.cwd}\n`)

    const shutdown = async (): Promise<void> => {
      await proxy.close()
      process.exit(0)
    }

    process.on('SIGINT', () => {
      void shutdown()
    })
    process.on('SIGTERM', () => {
      void shutdown()
    })

    await new Promise(() => {})
  },
}
