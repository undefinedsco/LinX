import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import process from 'node:process'
import { getFreePort, startXpodRuntime } from '@undefineds.co/xpod/runtime'

const readyPrefix = 'LINX_XPOD_READY '
const runtimeRoot = process.env.LINX_XPOD_RUNTIME_ROOT
const requestedPort = Number(process.env.LINX_XPOD_GATEWAY_PORT || '0')

if (!runtimeRoot) {
  throw new Error('LINX_XPOD_RUNTIME_ROOT is required')
}

fs.mkdirSync(runtimeRoot, { recursive: true })

async function canListen(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', (error) => {
      if (error?.code === 'EADDRINUSE' || error?.code === 'EACCES') {
        resolve(false)
        return
      }
      reject(error)
    })
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

async function getFreePortBlock(basePort) {
  for (let port = basePort; port < 65533; port += 3) {
    if (await canListen(port) && await canListen(port + 1) && await canListen(port + 2)) {
      return port
    }
  }
  throw new Error(`No free 3-port block found from ${basePort}`)
}

const gatewayPort = requestedPort > 0
  ? requestedPort
  : await getFreePortBlock(await getFreePort(5600 + Math.floor(Math.random() * 4000)))

const sparqlEndpoint = path.join(runtimeRoot, 'quadstore.sqlite')
const identityDbUrl = path.join(runtimeRoot, 'identity.sqlite')
const baseUrl = `http://127.0.0.1:${gatewayPort}/`

const runtime = await startXpodRuntime({
  mode: 'local',
  open: true,
  authMode: 'allow-all',
  transport: 'port',
  runtimeRoot,
  sparqlEndpoint,
  identityDbUrl,
  logLevel: process.env.CSS_LOGGING_LEVEL ?? 'warn',
  gatewayPort,
  cssPort: gatewayPort + 1,
  apiPort: gatewayPort + 2,
})

process.stdout.write(`${readyPrefix}${JSON.stringify({
  baseUrl,
  sparqlEndpoint,
  gatewayPort,
  cssPort: gatewayPort + 1,
  apiPort: gatewayPort + 2,
})}\n`)

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await runtime.stop().catch((error) => {
    process.stderr.write(`xpod runtime stop failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  })
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })

await new Promise(() => undefined)
