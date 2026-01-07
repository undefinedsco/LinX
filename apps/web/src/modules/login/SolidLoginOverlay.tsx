import { useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { SolidLoginModal } from './SolidLoginModal'
import { useSolidLoginController } from './controller'
import { saveRedirectPath } from './login-utils'

export function SolidLoginOverlay() {
  const [hydrated, setHydrated] = useState(false)
  const routerState = useRouterState()
  const { showModal, modalProps } = useSolidLoginController()
  const pathname = routerState.location.pathname

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (!hydrated) {
    return null
  }
  
  console.log('🔍 SolidLoginOverlay 状态:', {
    showModal,
    pathname,
    mode: modalProps.mode,
    shouldRender: showModal && !pathname.startsWith('/auth/callback')
  })
  
  if (!showModal || pathname.startsWith('/auth/callback')) return null
  return <SolidLoginModal {...modalProps} />
}
