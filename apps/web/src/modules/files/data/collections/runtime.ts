import type { SolidDatabase } from '@undefineds.co/models'

export function createFilesDatabaseRuntime() {
  let filesDatabaseGetter: (() => SolidDatabase | null) | null = null

  function setFilesDatabaseGetter(getter: () => SolidDatabase | null) {
    filesDatabaseGetter = getter
  }

  function getDb(): SolidDatabase | null {
    return filesDatabaseGetter?.() ?? null
  }

  return {
    getDb,
    setFilesDatabaseGetter,
  }
}
