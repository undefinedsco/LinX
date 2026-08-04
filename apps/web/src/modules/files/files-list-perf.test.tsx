import { performance } from 'node:perf_hooks'
import { Profiler, type ProfilerOnRenderCallback } from 'react'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { listContainerEntries } from './browser'
import { FilesExplorerRow } from './ui/FilesExplorerRow'

const entryCount = readPositiveInteger(process.env.FILES_BENCH_ENTRIES, 80)
const rttMs = readPositiveInteger(process.env.FILES_BENCH_RTT_MS, 20)
const concurrency = readPositiveInteger(process.env.FILES_BENCH_CONCURRENCY, 6)

describe('Files folder-list benchmark', () => {
  it('compares eager metadata hydration with the current snapshot path', async () => {
    const baseline = await measure({ enrichMetadata: true })
    const snapshot = await measure({ enrichMetadata: false })

    console.table([
      {
        Path: 'Baseline 1+N metadata',
        Entries: baseline.entries,
        'Directory calls': baseline.directoryCalls,
        'Metadata calls': baseline.metadataCalls,
        'Elapsed ms': baseline.elapsedMs,
      },
      {
        Path: 'Current directory snapshot',
        Entries: snapshot.entries,
        'Directory calls': snapshot.directoryCalls,
        'Metadata calls': snapshot.metadataCalls,
        'Elapsed ms': snapshot.elapsedMs,
      },
    ])
    console.log(
      `Configuration: ${entryCount} entries, ${rttMs}ms RTT, ${concurrency} concurrent requests`,
    )

    expect(snapshot.entries).toBe(entryCount)
    expect(snapshot.directoryCalls).toBe(1)
    expect(snapshot.metadataCalls).toBe(0)
    expect(baseline.metadataCalls).toBe(entryCount)
  })

  it('reports the React commit cost of mounting a large expanded branch', () => {
    const rowCounts = [80, 600]
    const results = rowCounts.map((count) => {
      let actualDuration = 0
      const onRender: ProfilerOnRenderCallback = (
        _id,
        phase,
        duration,
      ) => {
        if (phase === 'mount') actualDuration += duration
      }

      const startedAt = performance.now()
      const view = render(
        <Profiler id={`files-${count}`} onRender={onRender}>
          <div role="tree">
            {Array.from({ length: count }, (_, index) => (
              <FilesExplorerRow
                key={index}
                uri={`https://pod.example/public/file-${index}.md`}
                name={`file-${index}.md`}
                iconKind="file"
                depth={1}
                expandable={false}
                expanded={false}
                selected={false}
                onToggle={() => undefined}
                onSelect={() => undefined}
                onOpen={() => undefined}
                onContextMenu={() => undefined}
                onContextMenuOpenChange={() => undefined}
                onKeyCommand={() => null}
                renderContextMenu={() => null}
              />
            ))}
          </div>
        </Profiler>,
      )
      const wallTime = performance.now() - startedAt
      view.unmount()
      cleanup()

      return {
        Rows: count,
        'React actual ms': round(actualDuration),
        'Wall ms': round(wallTime),
      }
    })

    console.table(results)
    expect(results).toHaveLength(2)
    expect(results.every((result) => result['React actual ms'] >= 0)).toBe(true)
  })
})

async function measure({ enrichMetadata }: { enrichMetadata: boolean }) {
  const limiter = createLimiter(concurrency)
  let directoryCalls = 0
  let metadataCalls = 0

  const db = {
    getDialect: () => ({
      getPodUrl: () => 'https://pod.example/',
      listContainerResources: async () => {
        directoryCalls += 1
        await limiter.wait()
        return Array.from(
          { length: entryCount },
          (_, index) => `https://pod.example/public/file-${index}.md`,
        )
      },
      getAuthenticatedFetch: () => async () => {
        metadataCalls += 1
        await limiter.wait()
        return new Response('', {
          status: 200,
          headers: {
            'content-length': '128',
            'content-type': 'text/markdown',
            'last-modified': 'Wed, 29 Jul 2026 00:00:00 GMT',
          },
        })
      },
    }),
  } as never

  const startedAt = performance.now()
  const entries = await listContainerEntries(
    db,
    'https://pod.example/public/',
    undefined,
    { enrichMetadata },
  )

  return {
    entries: entries.length,
    directoryCalls,
    metadataCalls,
    elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
  }
}

function createLimiter(maxConcurrency: number) {
  let active = 0
  const queue: Array<() => void> = []

  return {
    wait: () => new Promise<void>((resolve) => {
      const run = () => {
        active += 1
        setTimeout(() => {
          active -= 1
          resolve()
          queue.shift()?.()
        }, rttMs)
      }

      if (active < maxConcurrency) run()
      else queue.push(run)
    }),
  }
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function round(value: number) {
  return Math.round(value * 10) / 10
}
