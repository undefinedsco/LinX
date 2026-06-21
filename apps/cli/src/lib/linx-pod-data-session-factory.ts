import { loadCredentials } from './credentials-store.js'
import { createPodDataSession, type PodDataSession } from './pod-data-session.js'

export type { PodDataSession }

export async function createLinxPodDataSession(): Promise<PodDataSession> {
  if (!loadCredentials()) {
    throw new Error('No credentials found. Run `linx login` first.')
  }

  const podSession = await createPodDataSession()
  if (!podSession) {
    throw new Error('Unsupported LinX auth type. Run `linx login` again.')
  }

  return podSession
}

export async function resolveStartupLinxPodDataSession(): Promise<PodDataSession | null> {
  if (!loadCredentials()) {
    return null
  }

  return createLinxPodDataSession()
}
