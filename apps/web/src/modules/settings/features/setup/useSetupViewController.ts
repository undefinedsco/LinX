import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import type { SetupConfig } from '../../domain/types'
import {
  buildCompleteSetupConfig,
  buildSetupPayload,
  createSetupDraft,
  normalizeDomain,
  validateSetupDraft,
  type SetupDraft,
} from '../../domain/setup-model'
import { isServiceSetupMode, loadSetupConfig, saveSetupConfig } from '../../data/setup-client'

export interface SetupViewControllerOptions {
  onComplete?: (config: SetupConfig) => void
}

export function useSetupViewController({ onComplete }: SetupViewControllerOptions) {
  const navigate = useNavigate()
  const isServiceMode = isServiceSetupMode()
  const [draft, setDraft] = useState<SetupDraft>(() => createSetupDraft())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const updateDraft = useCallback((patch: Partial<SetupDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!isServiceMode) {
      setLoading(false)
      return
    }

    try {
      setDraft(createSetupDraft(await loadSetupConfig()))
      setAdvancedOpen(false)
    } catch (loadError) {
      setError(formatLoginErrorForUser(loadError, '读取配置失败。请稍后重试。'))
    } finally {
      setLoading(false)
    }
  }, [isServiceMode])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(async () => {
    setError(null)
    setSuccess(null)

    const validationError = validateSetupDraft(draft)
    if (validationError) {
      setError(validationError.message)
      if (validationError.revealAdvanced) setAdvancedOpen(true)
      return
    }

    setSaving(true)
    try {
      await saveSetupConfig(buildSetupPayload(draft))
      onComplete?.(buildCompleteSetupConfig(draft))
      setSuccess('配置已保存。启动服务仍需明确操作。')
    } catch (saveError) {
      setError(formatLoginErrorForUser(saveError, '保存配置失败。请检查配置后重试。'))
    } finally {
      setSaving(false)
    }
  }, [draft, onComplete])

  const returnToMain = useCallback(() => {
    void navigate({ to: '/$appletId', params: { appletId: 'chat' } })
  }, [navigate])

  return {
    isServiceMode,
    loading,
    saving,
    error,
    success,
    advancedOpen,
    draft,
    effectivePublicDomain: useMemo(() => normalizeDomain(draft.publicDomain), [draft.publicDomain]),
    updateDraft,
    setAdvancedOpen,
    reload,
    save,
    returnToMain,
  }
}
