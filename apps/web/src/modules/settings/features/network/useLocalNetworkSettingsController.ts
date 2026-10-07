import { useCallback, useEffect, useState } from 'react'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { useLocalOnboarding } from '../../data/use-local-onboarding'
import {
  cloudflareServiceUrl,
  customDomainInput,
  networkStatusLabel,
} from '../../domain/network-model'

export function useLocalNetworkSettingsController() {
  const onboarding = useLocalOnboarding()
  const {
    snapshot,
    isDesktop,
    loading,
    acting,
    refresh: refreshOnboarding,
    saveNetworkConfig,
    testConnectivity: testOnboardingConnectivity,
  } = onboarding
  const [publicDomain, setPublicDomain] = useState('')
  const [domainTouched, setDomainTouched] = useState(false)
  const [tunnelToken, setTunnelToken] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!domainTouched) setPublicDomain(customDomainInput(snapshot.publicUrl))
  }, [domainTouched, snapshot.publicUrl])

  const refresh = useCallback(async () => {
    setActionError(null)
    setSuccess(null)
    try {
      await refreshOnboarding()
    } catch (error) {
      setActionError(formatLoginErrorForUser(error, '读取本地网络设置失败。请稍后重试。'))
    }
  }, [refreshOnboarding])

  const save = useCallback(async () => {
    setActionError(null)
    setSuccess(null)
    try {
      const next = await saveNetworkConfig({
        publicDomain,
        tunnelProvider: 'cloudflare',
        tunnelToken: tunnelToken.trim() || undefined,
      })
      if (next.errorCode) {
        setAdvancedOpen(true)
        setActionError(formatLoginErrorForUser(next.message, '网络配置没有保存。请检查后重试。'))
        return
      }
      setTunnelToken('')
      setDomainTouched(false)
      setSuccess('网络配置已保存。')
    } catch (error) {
      setAdvancedOpen(true)
      setActionError(formatLoginErrorForUser(error, '网络配置没有保存。请检查后重试。'))
    }
  }, [publicDomain, saveNetworkConfig, tunnelToken])

  const testConnectivity = useCallback(async () => {
    setActionError(null)
    setSuccess(null)
    try {
      await testOnboardingConnectivity()
      setSuccess('可达性检测已完成。')
    } catch (error) {
      setActionError(formatLoginErrorForUser(error, '可达性检测失败。请稍后重试。'))
    }
  }, [testOnboardingConnectivity])

  const updatePublicDomain = useCallback((value: string) => {
    setDomainTouched(true)
    setPublicDomain(value)
  }, [])

  return {
    snapshot,
    isDesktop,
    loading,
    busy: loading || acting,
    publicDomain,
    tunnelToken,
    actionError,
    success,
    advancedOpen,
    canonicalUrl: snapshot.publicUrl,
    localUrl: snapshot.localUrl ?? snapshot.baseUrl,
    serviceUrl: cloudflareServiceUrl(snapshot),
    hasSavedToken: Boolean(snapshot.tunnel?.hasToken),
    statusLabel: networkStatusLabel(snapshot.state, loading),
    updatePublicDomain,
    setTunnelToken,
    setAdvancedOpen,
    refresh,
    save,
    testConnectivity,
  }
}
