type OfflineJob<T = unknown> = {
  run: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (error: unknown) => void
}

const queue: OfflineJob<any>[] = []
let listening = false

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)

const ensureListener = () => {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('online', flushQueue)
}

const flushQueue = async () => {
  if (!isOnline()) return
  while (queue.length) {
    const job = queue.shift()
    if (!job) break
    try {
      const result = await job.run()
      job.resolve(result)
    } catch (error) {
      job.reject(error)
    }
  }
}

export const runWithOfflineQueue = async <T>(runner: () => Promise<T>): Promise<T> => {
  if (isOnline()) {
    return runner()
  }
  ensureListener()
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: runner,
      resolve,
      reject,
    })
  })
}
