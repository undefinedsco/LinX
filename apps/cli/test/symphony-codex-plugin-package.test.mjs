import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const marketplaceRoot = process.env.LINX_MARKETPLACE_ROOT ?? join(repoRoot, '..', 'marketplace')

test('symphony Codex plugin packager generates installable skill plus MCP bridge without duplicating skill truth', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-plugin-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const module = await import('../scripts/pack-symphony-codex-plugin.mjs')
  const result = module.packSymphonyCodexPlugin({ targetRoot: root })
  module.assertPackedPlugin(result.pluginRoot)

  const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf-8'))
  assert.equal(manifest.name, 'linx-symphony')
  assert.equal(manifest.skills, './skills/')
  assert.equal(manifest.mcpServers, './.mcp.json')
  assert.equal('hooks' in manifest, false)
  assert.equal(manifest.interface.displayName, 'LinX Symphony')

  const mcp = JSON.parse(readFileSync(result.mcpPath, 'utf-8'))
  assert.deepEqual(mcp.mcpServers['linx-symphony'], {
    command: 'node',
    args: ['./scripts/symphony-mcp.mjs'],
  })
  assert.equal(JSON.stringify(mcp).includes('linx symphony-codex-mcp'), false)
  const hooks = JSON.parse(readFileSync(result.hooksPath, 'utf-8'))
  assert.deepEqual(Object.keys(hooks.hooks).sort(), [
    'PostToolUse',
    'PreToolUse',
    'SessionStart',
    'Stop',
    'UserPromptSubmit',
  ])
  for (const eventName of Object.keys(hooks.hooks)) {
    assert.equal(hooks.hooks[eventName][0].hooks[0].command, 'node ./scripts/symphony-hook-events.mjs')
  }
  assert.equal(existsSync(result.hookScriptTarget), true)

  const canonicalSkill = readFileSync(join(marketplaceRoot, 'plugins', 'linx-symphony', 'skills', 'symphony', 'SKILL.md'), 'utf-8')
  const packedSkill = readFileSync(result.skillTarget, 'utf-8')
  assert.equal(packedSkill, canonicalSkill)
  const captureSkill = join(marketplaceRoot, 'plugins', 'linx-capture', 'skills', 'capture', 'SKILL.md')
  assert.equal(existsSync(captureSkill), true)
  assert.equal(existsSync(join(result.pluginRoot, 'skills', 'capture', 'SKILL.md')), false)

  const listed = spawnSync('node', ['./scripts/symphony-mcp.mjs'], {
    cwd: result.pluginRoot,
    input: '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n',
    encoding: 'utf-8',
  })
  assert.equal(listed.status, 0, listed.stderr)
  const response = JSON.parse(listed.stdout.trim())
  const tools = response.result.tools.map((tool) => tool.name)
  assert.deepEqual(tools, ['delivery_status', 'validate_delivery', 'submit_delivery', 'reconcile'])
})
