import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import process from 'node:process'

const IMAGE = /^ghcr\.io\/undefinedsco\/xpod@(sha256:[0-9a-f]{64})$/
const DIGEST = /(?:^|@)(sha256:[0-9a-f]{64})$/

function fail(reason) {
  throw new Error(`xpod RC runtime evidence: ${reason}`)
}

/** Bind the browser acceptance to the exact running backend, without reading secrets. */
export function observeProviderRuntime(deployment, podList, manifestBytes) {
  const containers = deployment?.spec?.template?.spec?.containers ?? []
  const target = containers.find((container) => container.name === 'xpod')
  const digest = typeof target?.image === 'string' && IMAGE.exec(target.image)?.[1]
  if (!digest) fail('Deployment must select an immutable Xpod image digest')
  const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  // Some registry clients append one output newline to the original manifest.
  let original = Buffer.from(manifestBytes)
  if (hash(original) !== digest && original.at(-1) === 10) original = original.subarray(0, -1)
  if (hash(original) !== digest) fail('registry manifest bytes do not match the selected digest')
  const manifest = JSON.parse(original.toString('utf8'))
  if (!deployment.metadata?.uid || deployment.spec.replicas !== 1
    || deployment.status?.observedGeneration !== deployment.metadata.generation
    || deployment.status?.readyReplicas !== 1 || deployment.status?.updatedReplicas !== 1) {
    fail('Deployment has not converged to one ready replica')
  }
  const allowed = new Set([digest])
  if (manifest?.manifests) {
    for (const child of manifest.manifests) {
      if (child.platform?.os === 'linux' && child.platform.architecture === 'amd64'
        && /^sha256:[0-9a-f]{64}$/.test(child.digest)) allowed.add(child.digest)
    }
  }
  const pods = (podList?.items ?? []).filter((pod) => !pod.metadata?.deletionTimestamp
    && pod.status?.phase === 'Running')
  if (pods.length !== 1) fail('expected exactly one running provider Pod')
  const pod = pods[0]
  const declared = pod.spec?.containers?.find((container) => container.name === 'xpod')
  const running = pod.status?.containerStatuses?.find((container) => container.name === 'xpod')
  const runtimeDigest = typeof running?.imageID === 'string' && DIGEST.exec(running.imageID)?.[1]
  if (declared?.image !== target.image || !runtimeDigest || !allowed.has(runtimeDigest)) {
    fail('running backend image does not match the selected digest')
  }
  if (running?.ready !== true || !running.state?.running || !running.containerID
    || !pod.metadata?.uid || !Number.isInteger(running.restartCount)) {
    fail('provider container is not ready with a stable identity')
  }
  return {
    schema: 'linx-xpod-runtime/1',
    deploymentUid: deployment.metadata.uid,
    generation: deployment.metadata.generation,
    image: target.image,
    digest,
    runtimeDigest,
    podUid: pod.metadata.uid,
    containerId: running.containerID,
    restartCount: running.restartCount,
  }
}

/** A rollout, replacement or restart during the browser flow invalidates this evidence. */
export function assertSameProviderRuntime(before, after) {
  const fields = ['schema', 'deploymentUid', 'generation', 'image', 'digest',
    'runtimeDigest', 'podUid', 'containerId', 'restartCount']
  if (before?.schema !== 'linx-xpod-runtime/1') fail('unknown runtime evidence schema')
  for (const field of fields) {
    if (before[field] === undefined || before[field] !== after?.[field]) {
      fail(`provider changed during acceptance (${field})`)
    }
  }
  return after
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    const [mode, ...files] = process.argv.slice(2)
    const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
    if (mode === 'observe' && files.length === 4) {
      writeFileSync(files[3], JSON.stringify(observeProviderRuntime(read(files[0]), read(files[1]), readFileSync(files[2])), null, 2) + '\n')
    } else if (mode === 'compare' && files.length === 2) {
      assertSameProviderRuntime(...files.map(read))
    } else {
      fail('usage: observe DEPLOYMENT PODS MANIFEST OUTPUT | compare BEFORE AFTER')
    }
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith('xpod RC runtime evidence:')
      ? error.message : 'xpod RC runtime evidence: invalid evidence input')
    process.exitCode = 1
  }
}
