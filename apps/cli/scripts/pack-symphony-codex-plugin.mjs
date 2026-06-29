import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveMarketplaceSkillDir } from './product-skills.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = resolve(cliRoot, '../..')
const agentRuntimeRoot = join(repoRoot, 'packages', 'agent-runtime')
const defaultTargetRoot = join(cliRoot, 'dist', 'plugins')
const pluginName = 'linx-symphony'

export function packSymphonyCodexPlugin(options = {}) {
  const targetRoot = resolve(options.targetRoot ?? defaultTargetRoot)
  const pluginRoot = join(targetRoot, pluginName)
  const packageJson = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf-8'))
  const marketplaceSkillsRoot = resolveMarketplaceSkillDir(repoRoot, 'symphony')
  const skillSource = join(marketplaceSkillsRoot, 'symphony', 'SKILL.md')
  const skillTarget = join(pluginRoot, 'skills', 'symphony', 'SKILL.md')
  const manifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json')
  const mcpPath = join(pluginRoot, '.mcp.json')
  const hooksPath = join(pluginRoot, 'hooks.json')
  const hookScriptSource = join(cliRoot, 'src', 'lib', 'codex-plugin', 'symphony-hook-events.mjs')
  const hookScriptTarget = join(pluginRoot, 'scripts', 'symphony-hook-events.mjs')
  const mcpScriptSource = join(cliRoot, 'dist', 'lib', 'codex-plugin', 'symphony-mcp.js')
  const mcpScriptTarget = join(pluginRoot, 'scripts', 'symphony-mcp.mjs')
  const agentRuntimeDistSource = join(agentRuntimeRoot, 'dist')
  const agentRuntimeDistTarget = join(pluginRoot, 'node_modules', '@linx', 'agent-runtime', 'dist')
  const agentRuntimePackageJsonTarget = join(pluginRoot, 'node_modules', '@linx', 'agent-runtime', 'package.json')

  assertFile(skillSource, 'marketplace Symphony skill')
  assertFile(hookScriptSource, 'Symphony Codex hook recorder')
  assertFile(mcpScriptSource, 'compiled Symphony Codex MCP server; run yarn workspace @undefineds.co/linx build before packing')
  assertFile(join(agentRuntimeDistSource, 'symphony.js'), 'compiled @linx/agent-runtime Symphony core; run yarn workspace @linx/agent-runtime build before packing')
  rmSync(pluginRoot, { recursive: true, force: true })
  mkdirSync(dirname(skillTarget), { recursive: true })
  mkdirSync(dirname(manifestPath), { recursive: true })
  mkdirSync(dirname(hookScriptTarget), { recursive: true })
  mkdirSync(dirname(agentRuntimePackageJsonTarget), { recursive: true })

  writeFileSync(skillTarget, readFileSync(skillSource, 'utf-8'))
  writeFileSync(hookScriptTarget, readFileSync(hookScriptSource, 'utf-8'))
  writeFileSync(mcpScriptTarget, readFileSync(mcpScriptSource, 'utf-8'))
  cpSync(agentRuntimeDistSource, agentRuntimeDistTarget, { recursive: true })
  writeFileSync(agentRuntimePackageJsonTarget, `${JSON.stringify(buildAgentRuntimePackage(), null, 2)}\n`)
  chmodSync(hookScriptTarget, 0o755)
  chmodSync(mcpScriptTarget, 0o755)
  writeFileSync(manifestPath, `${JSON.stringify(buildManifest(packageJson.version), null, 2)}\n`)
  writeFileSync(mcpPath, `${JSON.stringify(buildMcpConfig(), null, 2)}\n`)
  writeFileSync(hooksPath, `${JSON.stringify(buildHooksConfig(), null, 2)}\n`)
  writeFileSync(join(pluginRoot, 'README.md'), `${buildReadme()}\n`)

  assertPackedPlugin(pluginRoot)
  return { pluginRoot, manifestPath, mcpPath, hooksPath, hookScriptTarget, mcpScriptTarget, skillTarget }
}

export function assertPackedPlugin(pluginRoot) {
  const manifest = readJson(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'plugin manifest')
  if (manifest.name !== pluginName) {
    throw new Error(`Symphony Codex plugin manifest name must be ${pluginName}`)
  }
  if (manifest.skills !== './skills/' || manifest.mcpServers !== './.mcp.json') {
    throw new Error('Symphony Codex plugin must expose canonical skills and MCP server config')
  }
  if ('hooks' in manifest) {
    throw new Error('Symphony Codex plugin must not put hooks in plugin.json; Codex discovers root hooks.json')
  }
  const skill = readFileSync(join(pluginRoot, 'skills', 'symphony', 'SKILL.md'), 'utf-8')
  const marketplaceSkillsRoot = resolveMarketplaceSkillDir(repoRoot, 'symphony')
  const canonical = readFileSync(join(marketplaceSkillsRoot, 'symphony', 'SKILL.md'), 'utf-8')
  if (skill !== canonical) {
    throw new Error('Packed Symphony plugin skill diverged from marketplace plugins/linx-symphony/skills/symphony/SKILL.md')
  }
  const mcp = readJson(join(pluginRoot, '.mcp.json'), 'MCP config')
  const server = mcp.mcpServers?.['linx-symphony']
  if (!server || server.command !== 'node' || !Array.isArray(server.args) || server.args.join(' ') !== './scripts/symphony-mcp.mjs') {
    throw new Error('Symphony Codex plugin MCP config must launch bundled `node ./scripts/symphony-mcp.mjs`')
  }
  const hooks = readJson(join(pluginRoot, 'hooks.json'), 'Codex hooks config')
  for (const eventName of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
    const eventHooks = hooks.hooks?.[eventName]
    const command = eventHooks?.[0]?.hooks?.[0]?.command
    if (command !== 'node ./scripts/symphony-hook-events.mjs') {
      throw new Error(`Symphony Codex plugin hook ${eventName} must launch the hook recorder script`)
    }
  }
  assertFile(join(pluginRoot, 'scripts', 'symphony-hook-events.mjs'), 'Symphony Codex hook recorder script')
  assertFile(join(pluginRoot, 'scripts', 'symphony-mcp.mjs'), 'Symphony Codex MCP server script')
  assertFile(join(pluginRoot, 'node_modules', '@linx', 'agent-runtime', 'dist', 'symphony.js'), 'bundled @linx/agent-runtime Symphony core')
}

function buildManifest(version) {
  return {
    name: pluginName,
    version: normalizeVersion(version),
    description: 'Portable LinX Symphony control-lane skill, reconciler runner, and Delivery writer.',
    author: {
      name: 'undefineds.co',
      url: 'https://undefineds.co',
    },
    homepage: 'https://undefineds.co',
    repository: 'https://github.com/undefineds/linx',
    license: 'UNLICENSED',
    keywords: ['linx', 'symphony', 'worker', 'delivery'],
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: 'LinX Symphony',
      shortDescription: 'Adds the Symphony control-lane skill and Delivery tools.',
      longDescription: 'Installs the storage-agnostic Symphony skill plus an MCP bridge. The MCP server runs the shared reconciler over coding-agent events and writes final worker Deliveries into the local .pod mirror for later Pod sync.',
      developerName: 'undefineds.co',
      category: 'Developer Tools',
      capabilities: ['Read', 'Write'],
      websiteURL: 'https://undefineds.co',
      defaultPrompt: [
        'Use Symphony to execute this worker task and submit the Delivery.',
        'Validate the Symphony Delivery before ending this session.',
      ],
      brandColor: '#111827',
    },
  }
}

function buildMcpConfig() {
  return {
    mcpServers: {
      'linx-symphony': {
        command: 'node',
        args: ['./scripts/symphony-mcp.mjs'],
      },
    },
  }
}

function buildAgentRuntimePackage() {
  return {
    name: '@linx/agent-runtime',
    type: 'module',
    private: true,
    exports: {
      '.': './dist/index.js',
      './symphony': './dist/symphony.js',
    },
  }
}

function buildHooksConfig() {
  const recorder = {
    type: 'command',
    command: 'node ./scripts/symphony-hook-events.mjs',
    timeout: 5,
  }
  return {
    hooks: {
      SessionStart: [{
        matcher: 'startup|resume|clear',
        hooks: [recorder],
      }],
      UserPromptSubmit: [{
        hooks: [recorder],
      }],
      PreToolUse: [{
        hooks: [recorder],
      }],
      PostToolUse: [{
        hooks: [recorder],
      }],
      Stop: [{
        hooks: [recorder],
      }],
    },
  }
}

function buildReadme() {
  return `# LinX Symphony Plugin

Generated plugin package for coding agents.

- Marketplace skill source: \`plugins/linx-symphony/skills/symphony/SKILL.md\`.
- MCP server command: \`node ./scripts/symphony-mcp.mjs\`.
- The MCP server runs the storage-agnostic Symphony reconciler over Codex events and validates/submits Symphony Deliveries into the local .pod mirror.
- Native Codex hooks write redacted JSONL lifecycle events only when \`LINX_SYMPHONY_HOOK_EVENTS\` is configured.
- LinX syncs the local \`.pod\` Delivery resources through shared Pod/model use-cases.`
}

function normalizeVersion(version) {
  return typeof version === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
    ? version
    : '0.0.0'
}

function readJson(path, label) {
  assertFile(path, label)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function assertFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`)
  }
}

function parseArgs(argv) {
  const args = { targetRoot: defaultTargetRoot, check: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--target-root') {
      args.targetRoot = argv[++i]
    } else if (arg.startsWith('--target-root=')) {
      args.targetRoot = arg.slice('--target-root='.length)
    } else if (arg === '--check') {
      args.check = true
    } else if (arg === '--help') {
      process.stdout.write('Usage: node apps/cli/scripts/pack-symphony-codex-plugin.mjs [--target-root <dir>] [--check]\n')
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  const result = packSymphonyCodexPlugin({ targetRoot: args.targetRoot })
  if (args.check) {
    assertPackedPlugin(result.pluginRoot)
  }
  process.stdout.write(`${result.pluginRoot}\n`)
}
