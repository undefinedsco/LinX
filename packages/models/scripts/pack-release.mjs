import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const modelsRoot = fileURLToPath(new URL('..', import.meta.url))
const outRoot = join(repoRoot, 'preview')
const args = parseArgs(process.argv.slice(2))
const pkg = JSON.parse(readFileSync(join(modelsRoot, 'package.json'), 'utf-8'))
const version = args.version ?? pkg.version
const workRoot = join(tmpdir(), `undefineds-models-release-${Date.now()}`)

rmSync(workRoot, { recursive: true, force: true })
mkdirSync(workRoot, { recursive: true })
mkdirSync(outRoot, { recursive: true })

copyPackage(modelsRoot, workRoot)
writeJson(join(workRoot, 'package.json'), createPublishablePackage(pkg, version))

const tarball = npmPack(workRoot)
const out = join(outRoot, `undefineds-co-models-${version}.tgz`)
cpSync(tarball, out)
console.log(out)

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

function createPublishablePackage(packageJson, packageVersion) {
  return {
    ...packageJson,
    version: packageVersion,
    private: false,
    main: './dist/index.js',
    types: './dist/index.d.ts',
    files: [
      'dist',
      'README.md',
      'package.json',
    ],
    exports: {
      '.': {
        types: './dist/index.d.ts',
        default: './dist/index.js',
      },
      './ai-config': {
        types: './dist/ai-config/index.d.ts',
        default: './dist/ai-config/index.js',
      },
      './client': {
        types: './dist/client/index.d.ts',
        default: './dist/client/index.js',
      },
      './discovery': {
        types: './dist/discovery/index.d.ts',
        default: './dist/discovery/index.js',
      },
      './namespaces': {
        types: './dist/namespaces.d.ts',
        default: './dist/namespaces.js',
      },
      './profile': {
        types: './dist/profile.d.ts',
        default: './dist/profile.js',
      },
      './profile.schema': {
        types: './dist/profile.schema.d.ts',
        default: './dist/profile.schema.js',
      },
      './watch': {
        types: './dist/watch/index.d.ts',
        default: './dist/watch/index.js',
      },
    },
    publishConfig: {
      access: 'public',
    },
  }
}

function npmPack(cwd) {
  const pack = spawnSync('npm', ['pack'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      npm_config_cache: join(cwd, '.npm-cache'),
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
