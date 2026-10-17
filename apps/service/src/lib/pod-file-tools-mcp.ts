/**
 * stdio entry of the LinX file-tools MCP server (spawned by the ACP runner; see pod-file-tools.ts).
 * Forwards every tool call to the runner's loopback bridge, which turns it into a `tool_call` event.
 */
import * as readline from 'readline'
import { handlePodFileToolsMcpMessage, type JsonRpcMessage } from './pod-file-tools'

async function forward(name: string, args: Record<string, unknown>): Promise<string> {
  const endpoint = process.env.LINX_FILE_TOOLS_ENDPOINT
  const token = process.env.LINX_FILE_TOOLS_TOKEN
  if (!endpoint || !token) throw new Error('文件工具没有连上 LinX。')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Linx-Token': token },
    body: JSON.stringify({ name, arguments: args }),
  })
  const data = await response.json().catch(() => ({})) as { text?: string; error?: string }
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
  return data.text ?? ''
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let message: JsonRpcMessage
  try {
    message = JSON.parse(trimmed) as JsonRpcMessage
  } catch {
    return
  }
  void handlePodFileToolsMcpMessage(message, forward).then((response) => {
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
  })
})
rl.on('close', () => process.exit(0))
