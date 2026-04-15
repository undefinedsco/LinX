import type { LocalAccountSession } from '../local-account-session'
import { loadLocalAccountSession } from '../local-account-session'
import { LocalXpodMountSource } from './local-xpod-source'
import { RemoteSolidPodMountSource } from './remote-solid-pod-source'
import type {
  PodMountRecord,
  PodMountSnapshot,
  PodMountSource,
  ResolveAuthorizedPrimitivesInput,
  ResolvedAuthorizedPrimitives,
} from './types'

function emptySnapshot(): PodMountSnapshot {
  return {
    source: 'unknown',
    running: false,
    baseUrl: '',
    dataRoot: '',
    availablePodNames: [],
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export class PodMountSourceSelector implements PodMountSource {
  public constructor(private readonly sources: PodMountSource[]) {}

  private getSourceForRecord(record: PodMountRecord): PodMountSource | undefined {
    return this.sources.find((source) => source.getSnapshot().source === record.source)
  }

  public getSnapshot(): PodMountSnapshot {
    const snapshots = this.sources.map((source) => {
      try {
        return source.getSnapshot()
      } catch {
        return emptySnapshot()
      }
    })

    return snapshots.find((snapshot) => snapshot.availablePodNames.length > 0)
      ?? snapshots.find((snapshot) => snapshot.running)
      ?? snapshots[0]
      ?? emptySnapshot()
  }

  public resolveAuthorizedPrimitives(input: ResolveAuthorizedPrimitivesInput): ResolvedAuthorizedPrimitives {
    let firstError: Error | null = null
    let lastSnapshot: PodMountSnapshot | null = null

    for (const source of this.sources) {
      try {
        const result = source.resolveAuthorizedPrimitives(input)
        lastSnapshot = result.snapshot
        if (result.primitives.length > 0) {
          return result
        }
      } catch (error) {
        firstError ??= toError(error)
      }
    }

    if (firstError) {
      throw firstError
    }

    return {
      snapshot: lastSnapshot ?? this.getSnapshot(),
      primitives: [],
    }
  }

  public async prepareAuthorizedPrimitives(input: ResolveAuthorizedPrimitivesInput): Promise<ResolvedAuthorizedPrimitives> {
    let firstError: Error | null = null
    let lastSnapshot: PodMountSnapshot | null = null

    for (const source of this.sources) {
      try {
        const result = source.prepareAuthorizedPrimitives
          ? await source.prepareAuthorizedPrimitives(input)
          : source.resolveAuthorizedPrimitives(input)
        lastSnapshot = result.snapshot
        if (result.primitives.length > 0) {
          return result
        }
      } catch (error) {
        firstError ??= toError(error)
      }
    }

    if (firstError) {
      throw firstError
    }

    return {
      snapshot: lastSnapshot ?? this.getSnapshot(),
      primitives: [],
    }
  }

  public async activateMount(record: PodMountRecord): Promise<void> {
    const matching = this.getSourceForRecord(record)
    if (matching?.activateMount) {
      await matching.activateMount(record)
    }
  }

  public async releaseMount(record: PodMountRecord): Promise<void> {
    const matching = this.getSourceForRecord(record)
    if (matching?.releaseMount) {
      await matching.releaseMount(record)
    }
  }
}

export function createDefaultPodMountSource(options: {
  accountProvider?: () => LocalAccountSession | null
  mirrorRoot?: string
} = {}): PodMountSource {
  const accountProvider = options.accountProvider ?? loadLocalAccountSession
  return new PodMountSourceSelector([
    new LocalXpodMountSource(),
    new RemoteSolidPodMountSource({
      accountProvider,
      mirrorRoot: options.mirrorRoot,
    }),
  ])
}
