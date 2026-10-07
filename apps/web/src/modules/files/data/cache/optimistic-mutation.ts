type MaybePromise<T> = T | Promise<T>

export interface OptimisticMutationOutcome<TResult> {
  result: TResult | null
  error: unknown | null
}

export interface OptimisticMutationInput<TSnapshot, TResult> {
  stage: () => MaybePromise<TSnapshot>
  mutate: () => MaybePromise<TResult>
  commit?: (result: TResult) => MaybePromise<void>
  restore: (snapshot: TSnapshot, error: unknown) => MaybePromise<void>
  invalidate?: (outcome: OptimisticMutationOutcome<TResult>) => MaybePromise<void>
}

export async function runOptimisticMutation<TSnapshot, TResult>({
  stage,
  mutate,
  commit,
  restore,
  invalidate,
}: OptimisticMutationInput<TSnapshot, TResult>): Promise<TResult> {
  const snapshot = await stage()
  let result: TResult | null = null
  let error: unknown | null = null

  try {
    result = await mutate()
    await commit?.(result)
    return result
  } catch (caught) {
    error = caught
    await restore(snapshot, caught)
    throw caught
  } finally {
    await invalidate?.({ result, error })
  }
}
