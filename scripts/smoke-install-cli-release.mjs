import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const previewRoot = join(repoRoot, 'preview')
const prefix = mkdtempSync(join(tmpdir(), 'linx-cli-release-prefix-'))
const cache = mkdtempSync(join(tmpdir(), 'linx-cli-release-cache-'))

const modelsTarball = findTarball(/^undefineds-co-models-.+\.tgz$/)
const cliTarball = findTarball(/^undefineds-co-linx-.+\.tgz$/)

mkdirSync(prefix, { recursive: true })
mkdirSync(cache, { recursive: true })

run('npm', ['i', '-g', '--prefix', prefix, '--cache', cache, modelsTarball, cliTarball])

const binDir = process.platform === 'win32' ? prefix : join(prefix, 'bin')
const linxBin = process.platform === 'win32' ? join(prefix, 'linx.cmd') : join(binDir, 'linx')
if (!existsSync(linxBin)) {
  throw new Error(`linx binary not found at ${linxBin}`)
}

const smokeEnv = {
  ...process.env,
  PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
}

run(linxBin, ['--help'], { env: smokeEnv })
run(linxBin, ['--version'], { env: smokeEnv })

console.log(`release smoke install passed: ${linxBin}`)

function findTarball(pattern) {
  const matches = readdirSync(previewRoot)
    .filter((name) => pattern.test(name))
    .sort()
  const latest = matches.at(-1)
  if (!latest) {
    throw new Error(`No tarball matching ${pattern} in ${previewRoot}`)
  }
  return join(previewRoot, latest)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status ?? 1}`)
  }
}
