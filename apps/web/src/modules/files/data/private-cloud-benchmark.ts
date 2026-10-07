export interface FilesPrivateCloudBenchmarkResult {
  name: string
  requests: number
  status: number
  medianMs: number
  p90Ms: number
}

export async function benchmarkPrivateFilesReadPath(input: {
  authFetch: typeof fetch
  folderUri: string
  fileUri: string
  iterations?: number
}): Promise<FilesPrivateCloudBenchmarkResult[]> {
  const iterations = input.iterations ?? 5
  const request = (uri: string, method: 'GET' | 'HEAD') => async () => {
    const response = await input.authFetch(withBenchmarkNonce(uri), {
      method,
      headers: {
        Accept: 'text/turtle, application/ld+json;q=0.9, */*;q=0.1',
        'Cache-Control': 'no-cache',
      },
    })
    if (method === 'GET') await response.arrayBuffer()
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
    return response.status
  }

  return [
    await measure('Private folder GET', 1, iterations, request(input.folderUri, 'GET')),
    await measure('Private file HEAD', 1, iterations, request(input.fileUri, 'HEAD')),
    await measure('Private file GET', 1, iterations, request(input.fileUri, 'GET')),
    await measure('Legacy open (HEAD -> GET)', 2, iterations, async () => {
      await request(input.fileUri, 'HEAD')()
      return request(input.fileUri, 'GET')()
    }),
    await measure('Current open (GET)', 1, iterations, request(input.fileUri, 'GET')),
  ]
}

async function measure(
  name: string,
  requests: number,
  iterations: number,
  workflow: () => Promise<number>,
): Promise<FilesPrivateCloudBenchmarkResult> {
  const samples: number[] = []
  let status = 0

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now()
    try {
      status = await workflow()
    } catch (error) {
      status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0
    }
    samples.push(performance.now() - startedAt)
  }

  samples.sort((left, right) => left - right)
  return {
    name,
    requests,
    status,
    medianMs: round(samples[Math.floor(samples.length / 2)]),
    p90Ms: round(samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.9) - 1)]),
  }
}

function withBenchmarkNonce(uri: string) {
  const url = new URL(uri)
  url.searchParams.set('__files_bench', `${Date.now()}-${Math.random()}`)
  return url.toString()
}

function round(value: number) {
  return Math.round(value * 10) / 10
}
