#!/usr/bin/env node
/**
 * JSON patches for borrowing xpod's RC provider (deployment/xpod-rc) in LinX RC acceptance.
 *
 *   up      <deployment.json> <seed-secret> <provider-url> <api-url> <hosts>
 *           One patch: the per-run seed Secret, the Sealos-domain identity (container env
 *           overrides the envFrom runtime Secret, which names id-rc.undefineds.cn) and replicas 1,
 *           so a single ReplicaSet runs the CSS seed initializer.
 *   restore <deployment-before.json>
 *           Puts the seed Secret and env back as they were and scales to 0.
 *
 * Prints the patch for `kubectl patch --type=json -p`.
 */
import { readFileSync } from 'node:fs'
import process from 'node:process'

const SEED_VOLUME = 'xpod-rc-seed'
const CONTAINER = 'xpod'

function locate(deployment) {
  const spec = deployment?.spec?.template?.spec
  const volume = (spec?.volumes ?? []).findIndex((entry) => entry.name === SEED_VOLUME)
  const container = (spec?.containers ?? []).findIndex((entry) => entry.name === CONTAINER)
  if (volume < 0) throw new Error(`deployment/xpod-rc has no ${SEED_VOLUME} volume`)
  if (container < 0) throw new Error(`deployment/xpod-rc has no ${CONTAINER} container`)
  return { spec, volume, container }
}

export function upPatch(deployment, { seedSecret, providerUrl, apiUrl, allowedHosts }) {
  const { spec, volume, container } = locate(deployment)
  const overrides = { CSS_BASE_URL: providerUrl.replace(/\/+$/, ''), XPOD_API_BASE_URL: apiUrl.replace(/\/+$/, ''), CSS_ALLOWED_HOSTS: allowedHosts }
  const env = (spec.containers[container].env ?? []).filter((entry) => !(entry.name in overrides))
  return [
    { op: 'replace', path: `/spec/template/spec/volumes/${volume}/secret/secretName`, value: seedSecret },
    { op: 'add', path: `/spec/template/spec/containers/${container}/env`, value: [...env, ...Object.entries(overrides).map(([name, value]) => ({ name, value }))] },
    { op: 'replace', path: '/spec/replicas', value: 1 },
  ]
}

export function restorePatch(before) {
  const { spec, volume, container } = locate(before)
  return [
    { op: 'replace', path: `/spec/template/spec/volumes/${volume}/secret/secretName`, value: spec.volumes[volume].secret.secretName },
    { op: 'add', path: `/spec/template/spec/containers/${container}/env`, value: spec.containers[container].env ?? [] },
    { op: 'replace', path: '/spec/replicas', value: 0 },
  ]
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    const [command, file, seedSecret, providerUrl, apiUrl, allowedHosts] = process.argv.slice(2)
    const deployment = JSON.parse(readFileSync(file, 'utf8'))
    if (command === 'up' && seedSecret && providerUrl && apiUrl && allowedHosts) {
      console.log(JSON.stringify(upPatch(deployment, { seedSecret, providerUrl, apiUrl, allowedHosts })))
    } else if (command === 'restore') {
      console.log(JSON.stringify(restorePatch(deployment)))
    } else {
      throw new Error('usage: xpod-rc-provider-patch up <deployment.json> <seed-secret> <provider-url> <api-url> <hosts> | restore <deployment-before.json>')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
