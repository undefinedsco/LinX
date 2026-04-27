import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsRoot = join(repoRoot, 'packages', 'models')
const outRoot = join(repoRoot, 'preview')
const args = parseArgs(process.argv.slice(2))

const cliPkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf-8'))
const modelsPkg = JSON.parse(readFileSync(join(modelsRoot, 'package.json'), 'utf-8'))
const version = args.version ?? cliPkg.version
if (modelsPkg.version !== cliPkg.version && !args.version) {
  throw new Error(`CLI and models versions must match for release: cli=${cliPkg.version}, models=${modelsPkg.version}`)
}

const workRoot = join(tmpdir(), `linx-cli-release-${Date.now()}`)
const cliWorkRoot = join(workRoot, 'cli')

rmSync(workRoot, { recursive: true, force: true })
mkdirSync(outRoot, { recursive: true })
mkdirSync(cliWorkRoot, { recursive: true })

copyPackage(cliRoot, cliWorkRoot)

writeJson(join(cliWorkRoot, 'package.json'), createPublishableCliPackage(cliPkg, version))

const cliTarball = npmPack(cliWorkRoot, workRoot)

const cliOut = join(outRoot, `undefineds-co-linx-${version}.tgz`)
cpSync(cliTarball, cliOut)

console.log(cliOut)

function copyPackage(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => !src.includes('/node_modules/')
      && !src.includes('/.tmp-dev-emit/')
      && !src.endsWith('/.tmp-dev-emit')
      && !src.includes('/test/')
      && !src.includes('/tests/')
      && !src.includes('/src/'),
  })
}

function createPublishableCliPackage(pkg, packageVersion) {
  const dependencies = {
    ...(pkg.dependencies ?? {}),
    '@undefineds.co/models': packageVersion,
    '@zed-industries/codex-acp': '^0.9.5',
  }

  return {
    ...pkg,
    version: packageVersion,
    private: false,
    files: [
      'dist',
      'README.md',
      'package.json',
    ],
    dependencies,
    publishConfig: {
      access: 'public',
    },
  }
}

function npmPack(cwd, cacheRoot) {
  const pack = spawnSync('npm', ['pack'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      npm_config_cache: join(cacheRoot, '.npm-cache'),
    },
  })
  if ((pack.status ?? 1) !== 0) {
    process.exit(pack.status ?? 1)
  }

  const filename = pack.stdout.trim().split('\n').at(-1)
  if (!filename) {
    throw new Error(`npm pack did not print a tarball name for ${cwd}`)
  }
  const tarball = join(cwd, filename)
  if (!existsSync(tarball)) {
    throw new Error(`npm pack output was not found: ${tarball}`)
  }
  return tarball
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function parseArgs(argv) {
  const parsed = {
    version: undefined,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--version') {
      parsed.version = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--version=')) {
      parsed.version = arg.slice('--version='.length)
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }

  return parsed
}
