import { useMemo, useState } from 'react'
import { Settings, Loader2, X, ChevronRight, UserCircle } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { SolidLoginModalProps } from './types'
import { normalizeIssuerUrl } from './utils'

// WeChat-like compact dimensions
const MODAL_WIDTH = 'w-[300px]'
const MODAL_HEIGHT = 'h-[420px]'

export function SolidLoginModal(props: SolidLoginModalProps) {
  // Determine initial view based on whether we have a remembered account
  // logic: if mode is 'loading', show loading. if 'switch', show picker. 
  // if default and we have account info, show Identity View.
  
  const hasAccount = Boolean(props.account?.issuerLabel || props.account?.handle)
  const isSwitching = props.mode === 'switch'
  const isLoading = props.mode === 'loading'

  // If we are switching, or don't have an account, show the picker
  const showPicker = isSwitching || (!hasAccount && !isLoading)

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={cn(
          'relative flex flex-col bg-card text-card-foreground shadow-2xl overflow-hidden transition-all duration-300 ease-out',
          MODAL_WIDTH,
          MODAL_HEIGHT,
          'rounded-xl border border-border/20' // Subtle border
        )}
      >
        {/* Close Button (Top Right) */}
        <button
          onClick={props.onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Settings Button (Top Left - Optional, kept from original) */}
        {/* <button
          onClick={props.onOpenSettings}
          className="absolute top-4 left-4 text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          <Settings className="w-5 h-5" />
        </button> */}

        {/* Content Area */}
        <div className="flex-1 flex flex-col relative">
           {isLoading ? (
             <LoadingView account={props.account} onCancel={props.onCancel} />
           ) : showPicker ? (
             <ProviderPickerView {...props} />
           ) : (
             <IdentityView {...props} />
           )}
        </div>
      </div>
    </div>
  )
}

// --- Sub-Views ---

// 1. Identity View: The "WeChat Scan" style equivalent
// Shows avatar, name, and a big login button
function IdentityView(props: SolidLoginModalProps) {
  const avatarUrl = props.account?.avatarUrl
  const name = props.account?.displayName || props.account?.handle || 'Unknown User'
  const issuer = props.account?.issuerLabel

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 animate-in slide-in-from-right-4 duration-300">
      {/* Avatar Area */}
      <div className="mb-6 relative">
        <Avatar className="w-24 h-24 rounded-2xl shadow-xl border border-border/50">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback className="text-2xl bg-primary/10 text-primary">
            {name.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Provider Logo Badge */}
        {props.account?.issuerLogoUrl && (
          <div className="absolute -bottom-2 -right-2 bg-background p-1 rounded-lg shadow-sm border border-border/20">
            <img 
              src={props.account.issuerLogoUrl} 
              alt="Provider" 
              className="w-5 h-5 object-contain"
            />
          </div>
        )}
      </div>

      {/* Name */}
      <h2 className="text-xl font-medium text-foreground mb-1 text-center truncate w-full">
        {name}
      </h2>
      <p className="text-xs text-muted-foreground mb-10 text-center truncate w-full px-4">
        {issuer}
      </p>

      {/* Login Button */}
      <Button 
        className="w-full h-11 text-base font-normal rounded-lg mb-4 bg-primary hover:bg-primary/90 transition-all active:scale-[0.98]"
        onClick={props.onEnter}
      >
        进入 LinX
      </Button>

      {/* Switch Account Link */}
      <button 
        onClick={props.onSwitchAccount}
        className="text-xs text-primary/80 hover:text-primary mt-4 hover:underline transition-all"
      >
        切换账号
      </button>
    </div>
  )
}

// 2. Provider Picker View: List of providers
function ProviderPickerView(props: SolidLoginModalProps) {
  const [customUrl, setCustomUrl] = useState('')
  const [isCustom, setIsCustom] = useState(false)

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (customUrl) {
      props.onCustomIssuerChange(customUrl)
      props.onSaveCustomIssuer() // This usually triggers selection too in the parent logic
      // Trigger selection manually if needed, but parent props seem to handle flow
      props.onSelectIssuer(customUrl) 
    }
  }

  return (
    <div className="flex-1 flex flex-col px-6 py-8 animate-in slide-in-from-left-4 duration-300">
      <h2 className="text-xl font-medium text-center mb-8">登录 LinX</h2>

      <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
        {props.issuers.map((issuer) => (
          <button
            key={issuer.url}
            onClick={() => props.onSelectIssuer(issuer.url)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group border border-transparent hover:border-border/40"
          >
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm border border-border/10 shrink-0">
              {issuer.logoUrl ? (
                <img src={issuer.logoUrl} alt={issuer.label} className="w-6 h-6 object-contain" />
              ) : (
                <UserCircle className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {issuer.label || issuer.domain}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{issuer.url}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground" />
          </button>
        ))}

        {/* Custom Input Toggle */}
        {!isCustom ? (
          <button
            onClick={() => setIsCustom(true)}
            className="w-full flex items-center justify-center gap-2 p-3 mt-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            使用其他 Pod URL
          </button>
        ) : (
          <form onSubmit={handleCustomSubmit} className="mt-4 space-y-2 animate-in fade-in slide-in-from-bottom-2">
            <Input 
              autoFocus
              placeholder="https://my-pod.example.com" 
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="h-10 text-sm"
            />
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsCustom(false)} className="flex-1">取消</Button>
              <Button type="submit" size="sm" className="flex-1" disabled={!customUrl}>确定</Button>
            </div>
          </form>
        )}
      </div>
      
      {/* Back to Identity View if available (Cancel switch) */}
      {props.account?.handle && props.mode === 'switch' && (
         <div className="mt-4 pt-4 border-t border-border/30 text-center">
            <button onClick={props.onCancel} className="text-xs text-muted-foreground hover:text-foreground">
              返回当前账号
            </button>
         </div>
      )}
    </div>
  )
}

// 3. Loading View
function LoadingView({ account, onCancel }: { account?: SolidLoginModalProps['account'], onCancel: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 animate-in fade-in duration-500">
       <div className="mb-8 relative">
        <Avatar className="w-24 h-24 rounded-2xl shadow-inner opacity-80 grayscale-[0.5]">
          <AvatarImage src={account?.avatarUrl} />
          <AvatarFallback className="text-2xl">
            {account?.displayName?.slice(0, 1) || 'L'}
          </AvatarFallback>
        </Avatar>
        {/* Spinner Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-2xl backdrop-blur-[1px]">
           <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground mb-8 animate-pulse">正在连接 Pod...</p>
      
      <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs text-muted-foreground hover:text-destructive">
        取消登录
      </Button>
    </div>
  )
}
