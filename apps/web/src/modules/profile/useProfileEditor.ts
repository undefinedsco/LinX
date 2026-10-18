import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SolidProfileRow, SolidProfileUpdate } from '@undefineds.co/models'
import { useBrowserOnline } from '@/lib/use-browser-online'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { readProfile, updateProfile } from './collections'
import { AVATAR_MAX_BYTES, AvatarTooLargeError, uploadAvatar } from './avatar-upload'
import {
  readProfileValues,
  type ProfileFieldKey,
  type ProfileValues,
} from './domain/profile-fields'

export type ProfileEditableKey = ProfileFieldKey | 'avatar'

/** One line on the page; there is never a dialog for saving. */
export type ProfileSaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed'; field: ProfileEditableKey }
  | { kind: 'avatar-too-large' }
  | { kind: 'offline' }
  | { kind: 'changed-elsewhere'; field: ProfileFieldKey; previous: string }

const FIELD_KEYS: ProfileFieldKey[] = ['name', 'nick', 'note', 'region', 'gender', 'email', 'phone']

function toUpdate(patch: Partial<ProfileValues>): Partial<SolidProfileUpdate> {
  const update: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(patch)) {
    update[key] = value ? value : null
  }
  return update as Partial<SolidProfileUpdate>
}

/**
 * Edit-in-place for `profile/card#me`: every change is written immediately.
 * Offline changes wait and go out when the network is back; a value changed
 * by another app is taken over and can be put back with one click.
 */
export function useProfileEditor() {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const webId = session.info.webId || ''
  const authFetch = session.fetch
  const queryClient = useQueryClient()
  const online = useBrowserOnline()
  const queryKey = useMemo(() => ['profile', webId], [webId])

  const query = useQuery({
    queryKey,
    queryFn: async () => (db && webId ? await readProfile(db, webId) : null),
    enabled: !!db && !!webId,
    // This page is where another app's edits must show up.
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const stored = useMemo(
    () => readProfileValues(query.data as Record<string, unknown> | null | undefined),
    [query.data],
  )

  // Values typed here but not yet confirmed by the Pod (saving, failed, offline).
  const [pending, setPending] = useState<Partial<ProfileValues>>({})
  const pendingRef = useRef(pending)
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  const [status, setStatus] = useState<ProfileSaveStatus>({ kind: 'idle' })
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const retryRef = useRef<(() => void) | null>(null)
  const offlineAvatarRef = useRef<File | null>(null)
  const knownRef = useRef<ProfileValues | null>(null)

  const values = useMemo<ProfileValues>(() => ({ ...stored, ...pending }), [pending, stored])

  const commitSaved = useCallback((patch: Partial<ProfileValues>) => {
    knownRef.current = { ...(knownRef.current ?? stored), ...patch }
    queryClient.setQueryData(queryKey, (current: SolidProfileRow | null | undefined) => (
      { ...(current ?? {}), ...patch } as SolidProfileRow
    ))
    setPending((current) => {
      const next = { ...current }
      for (const key of Object.keys(patch) as ProfileEditableKey[]) delete next[key]
      return next
    })
  }, [queryClient, queryKey, stored])

  const persistFields = useCallback(async (patch: Partial<ProfileValues>, field: ProfileEditableKey) => {
    if (!db || !webId) return
    setStatus({ kind: 'saving' })
    try {
      await updateProfile(db, webId, toUpdate(patch))
      commitSaved(patch)
      retryRef.current = null
      setStatus({ kind: 'saved' })
    } catch {
      retryRef.current = () => { void persistFields(patch, field) }
      setStatus({ kind: 'failed', field })
    }
  }, [commitSaved, db, webId])

  const persistAvatar = useCallback(async (file: File) => {
    if (!db || !webId || !authFetch) return
    setStatus({ kind: 'saving' })
    try {
      const url = await uploadAvatar(authFetch, webId, file)
      await updateProfile(db, webId, { avatar: url })
      commitSaved({ avatar: url })
      retryRef.current = null
      setStatus({ kind: 'saved' })
    } catch (error) {
      if (error instanceof AvatarTooLargeError) {
        setStatus({ kind: 'avatar-too-large' })
        return
      }
      retryRef.current = () => { void persistAvatar(file) }
      setStatus({ kind: 'failed', field: 'avatar' })
    }
  }, [authFetch, commitSaved, db, webId])

  const saveField = useCallback(async (field: ProfileFieldKey, value: string) => {
    const next = value.trim()
    if (next === values[field] && !(field in pendingRef.current)) return
    pendingRef.current = { ...pendingRef.current, [field]: next }
    setPending((current) => ({ ...current, [field]: next }))
    if (!online) {
      setStatus({ kind: 'offline' })
      return
    }
    await persistFields({ [field]: next }, field)
  }, [online, persistFields, values])

  const changeAvatar = useCallback(async (file: File) => {
    if (file.size > AVATAR_MAX_BYTES) {
      setStatus({ kind: 'avatar-too-large' })
      return
    }
    setAvatarPreview(URL.createObjectURL(file))
    if (!online) {
      offlineAvatarRef.current = file
      setStatus({ kind: 'offline' })
      return
    }
    await persistAvatar(file)
  }, [online, persistAvatar])

  const retry = useCallback(() => {
    retryRef.current?.()
  }, [])

  const revertChange = useCallback(() => {
    if (status.kind !== 'changed-elsewhere') return
    void persistFields({ [status.field]: status.previous }, status.field)
  }, [persistFields, status])

  // Back online: send what waited, in one write.
  useEffect(() => {
    if (!online || status.kind !== 'offline') return
    const waiting = Object.fromEntries(
      Object.entries(pendingRef.current).filter(([key]) => key !== 'avatar'),
    ) as Partial<ProfileValues>
    const keys = Object.keys(waiting) as ProfileFieldKey[]
    if (keys.length > 0) void persistFields(waiting, keys[0]!)
    const avatar = offlineAvatarRef.current
    offlineAvatarRef.current = null
    if (avatar) void persistAvatar(avatar)
    if (keys.length === 0 && !avatar) setStatus({ kind: 'idle' })
  }, [online, persistAvatar, persistFields, status.kind])

  // Another app changed a field we were showing: take the new value, say so.
  useEffect(() => {
    if (!query.isSuccess) return
    const known = knownRef.current
    knownRef.current = stored
    if (!known) return
    for (const key of FIELD_KEYS) {
      if (key in pendingRef.current) continue
      if (stored[key] !== known[key]) {
        setStatus({ kind: 'changed-elsewhere', field: key, previous: known[key] })
        return
      }
    }
  }, [query.isSuccess, stored])

  useEffect(() => {
    knownRef.current = null
  }, [webId])

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  return {
    webId,
    authFetch,
    values,
    isLoading: query.isLoading,
    loadFailed: query.isError,
    reload: () => { void query.refetch() },
    status,
    online,
    avatarPreview,
    saveField,
    changeAvatar,
    retry,
    revertChange,
  }
}

export type ProfileEditor = ReturnType<typeof useProfileEditor>
