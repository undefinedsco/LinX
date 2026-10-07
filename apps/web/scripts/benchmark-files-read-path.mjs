import { performance } from 'node:perf_hooks'

const rttMs = readPositiveNumber(process.env.FILES_BENCH_RTT_MS, 80)
const concurrency = readPositiveNumber(process.env.FILES_BENCH_CONCURRENCY, 6)
const iterations = readPositiveNumber(process.env.FILES_BENCH_ITERATIONS, 5)

class SimulatedPod {
  #active = 0
  #queue = []

  constructor({ concurrency, rttMs }) {
    this.concurrency = concurrency
    this.rttMs = rttMs
    this.requests = 0
  }

  request() {
    this.requests += 1
    return new Promise((resolve) => {
      const run = () => {
        this.#active += 1
        setTimeout(() => {
          this.#active -= 1
          resolve()
          this.#queue.shift()?.()
        }, this.rttMs)
      }

      if (this.#active < this.concurrency) run()
      else this.#queue.push(run)
    })
  }
}

const scenarios = [
  {
    name: 'Pod root list',
    current: async (pod) => {
      await Promise.all([
        pod.request(), // root nodes
        pod.request(), // all-files entries
      ])
    },
    snapshot: async (pod) => {
      await pod.request()
    },
  },
  {
    name: 'Open one cold folder',
    current: async (pod) => {
      await pod.request()
    },
    snapshot: async (pod) => {
      await pod.request()
    },
  },
  {
    name: 'Same folder in tree + list',
    current: async (pod) => {
      await Promise.all([
        pod.request(), // children query
        pod.request(), // entries query
      ])
    },
    snapshot: async (pod) => {
      await pod.request()
    },
  },
  {
    name: 'Open text file',
    current: async (pod) => {
      await pod.request() // HEAD metadata
      await pod.request() // GET body
    },
    snapshot: async (pod) => {
      await pod.request() // GET body + response metadata
    },
  },
  {
    name: 'Open TTL first paint',
    current: async (pod) => {
      await pod.request() // HEAD metadata
      await Promise.all([
        pod.request(), // RDF body
        pod.request(), // view .meta
        pod.request(), // vocab registry
        pod.request(), // terms.ttl
        pod.request(), // shapes.ttl
        pod.request(), // namespaces.ttl
      ])
    },
    snapshot: async (pod) => {
      await Promise.all([
        pod.request(), // RDF body + response metadata
        pod.request(), // non-blocking view .meta
      ])
      // Vocab requests are intentionally excluded from first paint and run
      // only when a definition, shape, enum, or namespace is requested.
    },
  },
]

const results = []
for (const scenario of scenarios) {
  const current = await measure(scenario.current)
  const snapshot = await measure(scenario.snapshot)
  results.push({
    scenario: scenario.name,
    currentRequests: current.requests,
    snapshotRequests: snapshot.requests,
    currentMs: current.medianMs,
    snapshotMs: snapshot.medianMs,
    improvement: current.medianMs > 0
      ? Math.round((1 - snapshot.medianMs / current.medianMs) * 100)
      : 0,
  })
}

console.log(`Files read-path benchmark (${rttMs}ms RTT, ${concurrency} concurrent, median of ${iterations})`)
console.table(results.map((result) => ({
  Scenario: result.scenario,
  'Current req': result.currentRequests,
  'Snapshot req': result.snapshotRequests,
  'Current ms': result.currentMs,
  'Snapshot ms': result.snapshotMs,
  Faster: `${result.improvement}%`,
})))

async function measure(workflow) {
  const samples = []
  let requestCount = 0

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const pod = new SimulatedPod({ concurrency, rttMs })
    const start = performance.now()
    await workflow(pod)
    samples.push(performance.now() - start)
    requestCount = pod.requests
  }

  samples.sort((left, right) => left - right)
  return {
    medianMs: Math.round(samples[Math.floor(samples.length / 2)] * 10) / 10,
    requests: requestCount,
  }
}

function readPositiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
