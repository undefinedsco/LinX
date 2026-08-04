import { performance } from 'node:perf_hooks'

const iterations = readPositiveInteger(process.env.FILES_BENCH_ITERATIONS, 5)
const podRoot = new URL(process.env.FILES_BENCH_POD_ROOT ?? 'https://id.undefineds.co/gcloud/')
const fileUrl = new URL(process.env.FILES_BENCH_FILE_URL ?? 'profile/card', podRoot)
const folderUrl = new URL(process.env.FILES_BENCH_FOLDER_URL ?? '.', podRoot)

const headers = {
  Accept: 'text/turtle, application/ld+json;q=0.9, */*;q=0.1',
  'Cache-Control': 'no-cache',
}

console.log('Files read-path cloud benchmark')
console.log(`Pod: ${podRoot}`)
console.log(`Folder: ${folderUrl}`)
console.log(`File: ${fileUrl}`)
console.log(`Iterations: ${iterations} (median, real network, sequential requests)`)

const folderGet = await measureRequest('Folder GET', folderUrl, { method: 'GET', headers })
const fileHead = await measureRequest('File HEAD', fileUrl, { method: 'HEAD', headers })
const fileGet = await measureRequest('File GET', fileUrl, { method: 'GET', headers })
const currentOpen = await measureWorkflow('Current open (HEAD -> GET)', async () => {
  await checkedFetch(fileUrl, { method: 'HEAD', headers })
  await checkedFetch(fileUrl, { method: 'GET', headers })
})
const snapshotOpen = await measureWorkflow('Snapshot open (GET)', async () => {
  await checkedFetch(fileUrl, { method: 'GET', headers })
})

console.table([folderGet, fileHead, fileGet].map((result) => ({
  Request: result.name,
  Status: result.status,
  'Median ms': result.medianMs,
  'p90 ms': result.p90Ms,
  Bytes: result.bytes,
  URL: result.url,
})))

const faster = currentOpen.status === 200 && snapshotOpen.status === 200
  ? Math.round((1 - snapshotOpen.medianMs / currentOpen.medianMs) * 100)
  : null

console.table([currentOpen, snapshotOpen].map((result) => ({
  Workflow: result.name,
  Status: result.status,
  Requests: result.requests,
  'Median ms': result.medianMs,
  'p90 ms': result.p90Ms,
})))

if (faster !== null) {
  console.log(`Observed open-file improvement: ${faster}%`)
}

if ([folderGet, fileHead, fileGet].some((result) => result.status === 401 || result.status === 403)) {
  console.warn('One or more resources require an authenticated DPoP session; those timings are not treated as successful reads.')
  process.exitCode = 2
}

async function measureRequest(name, url, init) {
  const samples = []
  let status = 0
  let bytes = 0

  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()
    const response = await fetch(cacheBusted(url, index), init)
    const body = init.method === 'HEAD' ? new Uint8Array() : new Uint8Array(await response.arrayBuffer())
    samples.push(performance.now() - start)
    status = response.status
    bytes = body.byteLength
  }

  return summarize({ name, samples, status, bytes, url: String(url) })
}

async function measureWorkflow(name, workflow) {
  const samples = []
  let status = 200

  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()
    try {
      await workflow(index)
    } catch (error) {
      status = error.status ?? 0
    }
    samples.push(performance.now() - start)
  }

  return summarize({
    name,
    samples,
    status,
    requests: name.includes('HEAD') ? 2 : 1,
  })
}

async function checkedFetch(url, init) {
  const response = await fetch(cacheBusted(url, Math.random()), init)
  if (init.method !== 'HEAD') await response.arrayBuffer()
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return response
}

function cacheBusted(url, nonce) {
  const next = new URL(url)
  next.searchParams.set('__files_bench', `${Date.now()}-${nonce}`)
  return next
}

function summarize(result) {
  const samples = [...result.samples].sort((left, right) => left - right)
  return {
    ...result,
    medianMs: round(samples[Math.floor(samples.length / 2)]),
    p90Ms: round(samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.9) - 1)]),
  }
}

function round(value) {
  return Math.round(value * 10) / 10
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
