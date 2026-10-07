// @vitest-environment node
/**
 * subscribe 本地写触发探针（live sync 可行性）。
 *
 * 目的：实测 seeded xpod 下，本地 db.insert 是否触发 db.subscribe 的 onCreate 回调。
 *  - 若触发（fired>0）：live sync 把 subscribe 回调改 writeUpsert 后，本地写会经 onInsert writeUpsert
 *    与 subscribe writeUpsert 双重进 syncedData → 需 origin/去重，且该去重在本地 seeded 环境
 *    能否构造远程事件来验仍是问题。
 *  - 若不触发（fired==0）：subscribe 只服务远程回流，live sync writeUpsert 与 onInsert writeUpsert
 *    天然不冲突，无需去重，live sync 可"零去重简单改"。
 *  - 若 subscribe 不可用（seeded xpod 不支持 notifications）：live sync 远程回流路径在本地无法验，
 *    需真 Pod 双客户端或测试注入钩子，live sync 复杂度上调。
 *
 * 本探针只报告、不硬断言 fired 值（信息输出，非门禁）。
 */
import { afterAll, describe, expect, it } from 'vitest'
import { contactResource, solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'

let context: XpodIntegrationContext<typeof solidSchema> | null = null

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [contactResource],
  })
  return context
}

afterAll(async () => {
  await context?.stop()
}, 30000)

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

describe('subscribe local-write probe (live sync feasibility)', () => {
  it('reports whether a local db.insert fires the subscribe onCreate callback', { timeout: 45000 }, async () => {
    const { db, webId } = await getContext()
    let fired = 0
    let subscribeError: string | null = null
    let unsub: (() => void) | null = null

    try {
      const sub = await withTimeout(
        (db as any).subscribe(contactResource, {
          onCreate: () => {
            fired++
          },
          onUpdate: () => {
            fired++
          },
          onDelete: () => {
            fired++
          },
        }),
        8000,
        'subscribe',
      )
      unsub = typeof sub === 'function' ? sub : (sub?.unsubscribe?.bind(sub) ?? null)
    } catch (error) {
      subscribeError = error instanceof Error ? error.message : String(error)
    }

    const id = contactResource.buildId({ id: `probe-${Date.now()}` })
    if (!subscribeError) {
      await (db as any)
        .insert(contactResource)
        .values({ id, name: 'Probe', contactType: 'solid', about: webId })
        .execute()
      await new Promise((resolve) => setTimeout(resolve, 2500))
    }

    const interpretation = subscribeError
      ? 'seeded xpod notifications unavailable → live sync remote path NOT testable locally; needs real dual-client or test injection hook'
      : fired > 0
        ? 'LOCAL write triggers subscribe → live sync writeUpsert needs dedup vs onInsert writeUpsert (origin tracking)'
        : 'local write does NOT trigger subscribe → live sync writeUpsert serves remote only, no dedup needed (simple path)'

    // eslint-disable-next-line no-console
    console.table({
      'subscribe available': subscribeError === null,
      'subscribe error': subscribeError ?? '(none)',
      'local insert fired subscribe callback (count)': fired,
      interpretation,
    })

    try {
      await (db as any).deleteById(contactResource, id)
    } catch {
      // ignore cleanup
    }
    try {
      unsub?.()
    } catch {
      // ignore
    }

    expect(true).toBe(true)
  })
})
