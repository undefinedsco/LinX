import { useEffect, useRef } from 'react'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { AppletId } from './applet-registry'
import { createAppletRuntimeCoordinator, type AppletRuntimeCoordinator } from './applet-runtime'
import { appletRuntimeRegistry } from './applet-runtime-registry'

export function useActiveAppletRuntime(appletId: AppletId): void {
  const { db } = useSolidDatabase()
  const coordinatorRef = useRef<AppletRuntimeCoordinator | null>(null)
  if (!coordinatorRef.current) {
    coordinatorRef.current = createAppletRuntimeCoordinator(appletRuntimeRegistry)
  }

  useEffect(() => {
    const coordinator = coordinatorRef.current!
    if (!db) {
      void coordinator.deactivate()
      return
    }

    void coordinator.activate(appletId, db).catch((error) => {
      console.warn(`[AppletRuntime] Failed to activate ${appletId}:`, error)
    })

    return () => {
      void coordinator.deactivate()
    }
  }, [db, appletId])
}
