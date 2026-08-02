import { useEffect, useRef } from 'react'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { MicroAppId } from './micro-app-registry'
import { createMicroAppRuntimeCoordinator, type MicroAppRuntimeCoordinator } from './micro-app-runtime'
import { microAppRuntimeRegistry } from './micro-app-runtime-registry'

export function useActiveMicroAppRuntime(microAppId: MicroAppId): void {
  const { db } = useSolidDatabase()
  const coordinatorRef = useRef<MicroAppRuntimeCoordinator | null>(null)
  if (!coordinatorRef.current) {
    coordinatorRef.current = createMicroAppRuntimeCoordinator(microAppRuntimeRegistry)
  }

  useEffect(() => {
    const coordinator = coordinatorRef.current!
    if (!db) {
      void coordinator.deactivate()
      return
    }

    void coordinator.activate(microAppId, db).catch((error) => {
      console.warn(`[MicroAppRuntime] Failed to activate ${microAppId}:`, error)
    })

    return () => {
      void coordinator.deactivate()
    }
  }, [db, microAppId])
}
