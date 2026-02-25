import { useEffect, useState, useRef } from 'react';
import { useSession } from '@inrupt/solid-ui-react';
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AuthCallbackProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export default function SolidAuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const { session, sessionRequestInProgress } = useSession();
  const [error, setError] = useState<string | null>(null);
  const navigatedRef = useRef(false);

  // Check for OIDC errors in URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const errorParam = params.get('error')
      const errorDesc = params.get('error_description')

      console.log('🔍 AuthCallback URL params:', {
        code: params.get('code') ? 'present' : 'missing',
        state: params.get('state') ? 'present' : 'missing',
        error: errorParam
      })

      if (errorParam) {
        const msg = errorDesc ? decodeURIComponent(errorDesc) : '认证服务器拒绝了请求'
        console.warn('OIDC Error:', errorParam, msg)
        setError(msg)
      }
    }
  }, [])

  // Wait for SessionProvider to handle the redirect
  useEffect(() => {
    console.log('🔍 AuthCallback state:', {
      isLoggedIn: session.info.isLoggedIn,
      sessionRequestInProgress,
      webId: session.info.webId,
      navigated: navigatedRef.current
    })

    // Don't do anything if there's an error or we already navigated
    if (error || navigatedRef.current) return

    // Wait for session request to complete
    if (sessionRequestInProgress) {
      console.log('⏳ Session request in progress, waiting...')
      return
    }

    // Check login status
    if (session.info.isLoggedIn) {
      console.log('✅ Login successful!')
      navigatedRef.current = true
      onSuccess?.()
    } else {
      // Give SessionProvider time to process - it might still be initializing
      const timeout = setTimeout(() => {
        if (!session.info.isLoggedIn && !navigatedRef.current && !sessionRequestInProgress) {
          console.log('❌ Login failed after waiting')
          setError('登录失败，请重试')
        }
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [session.info.isLoggedIn, session.info.webId, sessionRequestInProgress, onSuccess, error])

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl p-8 text-center">
        {error ? (
          <div className="flex flex-col items-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">登录未完成</h2>
            <p className="text-sm text-muted-foreground mb-8 px-4">{error}</p>
            <Button
              onClick={() => onError?.(error)}
              className="w-full max-w-[200px]"
            >
              返回首页
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">正在验证身份</h2>
            <p className="text-sm text-muted-foreground">请稍候，即将进入 LinX...</p>
          </div>
        )}
      </div>
    </div>
  );
}
