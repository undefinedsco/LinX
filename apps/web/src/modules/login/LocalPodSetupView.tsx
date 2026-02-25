import { useState } from 'react'
import { ArrowLeft, FolderOpen, Globe, HardDrive, Loader2, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { SolidProvider, XpodStartOptions } from '@/types/electron-api'
import { checkSubdomain as checkSubdomainApi, claimSubdomain as claimSubdomainApi } from './subdomain-api'

export type DomainType = 'none' | 'undefineds' | 'custom'

export interface AuthCredentials {
  webId: string
  accessToken: string
  dpopProof: string
}

export interface LocalPodSetupProps {
  onBack: () => void
  onComplete: (provider: SolidProvider) => void
  onNeedAuth: (callback: (credentials: AuthCredentials) => void) => void
}

interface SetupStep {
  id: 'config' | 'subdomain' | 'starting'
  label: string
}

const STEPS: SetupStep[] = [
  { id: 'config', label: '配置' },
  { id: 'subdomain', label: '域名' },
  { id: 'starting', label: '启动' },
]

const DEFAULT_PORT = 5737
const DEFAULT_DATA_DIR = '~/LinX/pod'

export function LocalPodSetupView({ onBack, onComplete, onNeedAuth }: LocalPodSetupProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep['id']>('config')
  const [dataDir, setDataDir] = useState(DEFAULT_DATA_DIR)
  const [port] = useState(DEFAULT_PORT)
  const [domainType, setDomainType] = useState<DomainType>('undefineds')
  const [subdomain, setSubdomain] = useState('')
  const [customDomain, setCustomDomain] = useState('')
  const [customTunnelToken, setCustomTunnelToken] = useState('')
  const [isCheckingSubdomain, setIsCheckingSubdomain] = useState(false)
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [subdomainError, setSubdomainError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [startProgress, setStartProgress] = useState<string[]>([])
  const [startError, setStartError] = useState<string | null>(null)
  const [tunnelToken, setTunnelToken] = useState<string | null>(null)

  const isDesktop = typeof window !== 'undefined' && window.xpodDesktop

  const handleSelectDirectory = async () => {
    if (!isDesktop) return
    const selected = await window.xpodDesktop!.dialog.selectDirectory()
    if (selected) {
      setDataDir(selected)
    }
  }

  // 检查子域名可用性
  const checkSubdomain = async (name: string) => {
    if (!name || name.length < 3) {
      setSubdomainAvailable(null)
      setSubdomainError(null)
      return
    }

    setIsCheckingSubdomain(true)
    setSubdomainError(null)

    try {
      const result = await checkSubdomainApi(name)
      setSubdomainAvailable(result.available)
      if (!result.available) {
        const errorMessages: Record<string, string> = {
          'invalid-format': '子域名格式不正确',
          'reserved': '该子域名为系统保留名称',
          'already-taken': '该子域名已被占用',
        }
        setSubdomainError(errorMessages[result.reason ?? ''] ?? '子域名不可用')
      }
    } catch (error) {
      console.error('[LocalPodSetup] Failed to check subdomain:', error)
      setSubdomainError('检查子域名失败，请重试')
      setSubdomainAvailable(null)
    } finally {
      setIsCheckingSubdomain(false)
    }
  }

  const handleSubdomainChange = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSubdomain(normalized)
    setSubdomainAvailable(null)
    setSubdomainError(null)
  }

  const handleNextFromConfig = () => {
    if (domainType === 'none') {
      // 直接启动，不需要域名配置
      handleStartPod()
    } else {
      setCurrentStep('subdomain')
    }
  }

  const handleNextFromSubdomain = () => {
    if (domainType === 'undefineds') {
      // 需要验证身份并申请子域名
      onNeedAuth(async (credentials) => {
        console.log('[LocalPodSetup] Authenticated with WebID:', credentials.webId)
        try {
          setCurrentStep('starting')
          setStartProgress(['正在申请子域名...'])

          const result = await claimSubdomainApi(
            subdomain,
            credentials.accessToken,
            credentials.dpopProof
          )

          setTunnelToken(result.tunnelToken)
          setStartProgress(prev => [...prev, `子域名 ${result.fqdn} 申请成功!`])

          // 继续启动 Pod
          handleStartPod(result.tunnelToken)
        } catch (error) {
          console.error('[LocalPodSetup] Failed to claim subdomain:', error)
          setStartError(error instanceof Error ? error.message : '申请子域名失败')
          setCurrentStep('subdomain')
        }
      })
    } else {
      // Custom domain with user's tunnel token
      handleStartPod(customTunnelToken || undefined)
    }
  }

  const handleStartPod = async (claimedTunnelToken?: string) => {
    if (!isDesktop) {
      setStartError('仅支持桌面版')
      return
    }

    setCurrentStep('starting')
    setIsStarting(true)
    setStartError(null)
    // Only reset progress if not already showing subdomain claim progress
    if (startProgress.length === 0) {
      setStartProgress([])
    }

    const addProgress = (msg: string) => {
      setStartProgress(prev => [...prev, msg])
    }

    try {
      addProgress('初始化数据目录...')

      // 构建域名配置
      let domainValue: string | undefined
      if (domainType === 'undefineds' && subdomain) {
        domainValue = `${subdomain}.pods.undefineds.co`
      } else if (domainType === 'custom' && customDomain) {
        domainValue = customDomain
      }

      // 生成 Provider ID
      const providerId = `local-${Date.now()}`

      // Use claimed token or stored token
      const effectiveTunnelToken = claimedTunnelToken ?? tunnelToken ?? undefined

      // 创建 Provider
      const provider: SolidProvider = {
        id: providerId,
        name: domainValue ? `本地 Pod (${domainValue})` : '本地 Pod',
        issuerUrl: domainValue ? `https://${domainValue}` : `http://localhost:${port}`,
        managed: {
          status: 'stopped',
          dataDir,
          port,
          domain: {
            type: domainType,
            value: domainValue,
          },
          tunnelToken: effectiveTunnelToken,
        },
      }

      addProgress('添加 Provider...')
      await window.xpodDesktop!.provider.add(provider)

      addProgress('启动 xpod 服务...')
      const startOptions: XpodStartOptions = {
        providerId,
        dataDir,
        port,
        domain: {
          type: domainType,
          value: domainValue,
        },
        tunnelToken: effectiveTunnelToken,
      }

      await window.xpodDesktop!.xpod.start(startOptions)

      addProgress('等待服务就绪...')

      // 轮询健康检查
      let healthy = false
      for (let i = 0; i < 30; i++) {
        healthy = await window.xpodDesktop!.xpod.healthCheck()
        if (healthy) break
        await new Promise(r => setTimeout(r, 1000))
      }

      if (!healthy) {
        throw new Error('xpod 启动超时')
      }

      addProgress('服务已就绪!')

      // 更新 Provider 状态
      await window.xpodDesktop!.provider.update(providerId, {
        managed: { ...provider.managed!, status: 'running' },
      })

      // 完成
      setTimeout(() => {
        onComplete(provider)
      }, 1000)

    } catch (error) {
      console.error('[LocalPodSetup] Failed to start pod:', error)
      setStartError(error instanceof Error ? error.message : '启动失败')
      setIsStarting(false)
    }
  }

  const renderConfigStep = () => (
    <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Data Directory */}
      <div className="mb-6">
        <label className="text-sm font-medium text-foreground mb-2 block">数据目录</label>
        <div className="flex gap-2">
          <Input
            value={dataDir}
            onChange={(e) => setDataDir(e.target.value)}
            placeholder={DEFAULT_DATA_DIR}
            className="flex-1 h-11 rounded-xl"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
            onClick={handleSelectDirectory}
          >
            <FolderOpen className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">Pod 数据将存储在此目录</p>
      </div>

      {/* Domain Type Selection */}
      <div className="mb-6">
        <label className="text-sm font-medium text-foreground mb-3 block">域名配置</label>
        <div className="space-y-2">
          <DomainOption
            selected={domainType === 'undefineds'}
            onClick={() => setDomainType('undefineds')}
            icon={<Globe className="w-5 h-5 text-primary" />}
            title="申请 pods.undefineds.co 子域名"
            description="免费获得公网访问 + HTTPS"
            recommended
          />
          <DomainOption
            selected={domainType === 'custom'}
            onClick={() => setDomainType('custom')}
            icon={<Globe className="w-5 h-5 text-blue-500" />}
            title="使用自有域名"
            description="需要自行配置 DNS"
          />
          <DomainOption
            selected={domainType === 'none'}
            onClick={() => setDomainType('none')}
            icon={<HardDrive className="w-5 h-5 text-emerald-500" />}
            title="仅本地访问"
            description={`通过 http://localhost:${port} 访问`}
          />
        </div>
      </div>

      {/* Next Button */}
      <div className="mt-auto">
        <Button
          className="w-full h-12 text-base font-medium rounded-2xl"
          onClick={handleNextFromConfig}
        >
          {domainType === 'none' ? '创建并启动' : '下一步'}
        </Button>
      </div>
    </div>
  )

  const renderSubdomainStep = () => (
    <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
      {domainType === 'undefineds' ? (
        <>
          <div className="mb-6">
            <label className="text-sm font-medium text-foreground mb-2 block">选择子域名</label>
            <div className="flex items-center gap-0">
              <Input
                value={subdomain}
                onChange={(e) => handleSubdomainChange(e.target.value)}
                onBlur={() => checkSubdomain(subdomain)}
                placeholder="my-pod"
                className={cn(
                  "flex-1 h-11 rounded-l-xl rounded-r-none border-r-0",
                  subdomainError && "border-destructive"
                )}
              />
              <div className="h-11 px-3 flex items-center bg-muted border border-l-0 border-border rounded-r-xl text-sm text-muted-foreground">
                .pods.undefineds.co
              </div>
            </div>

            {/* Status */}
            <div className="mt-2 flex items-center gap-2">
              {isCheckingSubdomain ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">检查可用性...</span>
                </>
              ) : subdomainAvailable === true ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs text-emerald-500">子域名可用</span>
                </>
              ) : subdomainError ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-xs text-destructive">{subdomainError}</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">3-30 个字符，只能包含小写字母、数字和连字符</span>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-6 p-3 rounded-xl bg-muted/50">
            申请子域名需要验证你的 Solid 身份。你可以使用任意 Solid Provider 登录验证。
          </p>
        </>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">自有域名</label>
            <Input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="pod.example.com"
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              请确保域名已在 Cloudflare 配置好隧道
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Cloudflare Tunnel Token
            </label>
            <Input
              value={customTunnelToken}
              onChange={(e) => setCustomTunnelToken(e.target.value)}
              placeholder="eyJhIjoixx..."
              className="h-11 rounded-xl font-mono text-xs"
              type="password"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              从 Cloudflare Zero Trust 控制台获取
            </p>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="mt-auto flex gap-3">
        <Button
          variant="outline"
          className="flex-1 h-12 rounded-2xl"
          onClick={() => setCurrentStep('config')}
        >
          上一步
        </Button>
        <Button
          className="flex-1 h-12 rounded-2xl"
          onClick={handleNextFromSubdomain}
          disabled={
            (domainType === 'undefineds' && (!subdomain || !subdomainAvailable)) ||
            (domainType === 'custom' && (!customDomain || !customTunnelToken))
          }
        >
          {domainType === 'undefineds' ? '验证身份并创建' : '创建并启动'}
        </Button>
      </div>
    </div>
  )

  const renderStartingStep = () => (
    <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* Progress */}
      <div className="w-full max-w-[280px] mb-8">
        {startProgress.map((msg, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-sm text-foreground">{msg}</span>
          </div>
        ))}
        {isStarting && !startError && (
          <div className="flex items-center gap-2 py-1.5">
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            <span className="text-sm text-muted-foreground">处理中...</span>
          </div>
        )}
      </div>

      {/* Error */}
      {startError && (
        <div className="w-full max-w-[280px] p-4 rounded-xl bg-destructive/10 border border-destructive/20 mb-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">启动失败</p>
              <p className="text-xs text-destructive/80 mt-1">{startError}</p>
            </div>
          </div>
        </div>
      )}

      {startError && (
        <Button
          variant="outline"
          className="h-10 rounded-xl"
          onClick={() => {
            setCurrentStep('config')
            setStartError(null)
            setStartProgress([])
          }}
        >
          返回重试
        </Button>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col px-8 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-lg font-semibold">创建本地 Pod</h2>
          <p className="text-xs text-muted-foreground">在本机运行 Solid Pod 服务</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                currentStep === step.id
                  ? "bg-primary text-primary-foreground"
                  : STEPS.findIndex(s => s.id === currentStep) > i
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {STEPS.findIndex(s => s.id === currentStep) > i ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                i + 1
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5 mx-1",
                  STEPS.findIndex(s => s.id === currentStep) > i
                    ? "bg-emerald-500"
                    : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      {currentStep === 'config' && renderConfigStep()}
      {currentStep === 'subdomain' && renderSubdomainStep()}
      {currentStep === 'starting' && renderStartingStep()}
    </div>
  )
}

// Domain Option Component
function DomainOption({
  selected,
  onClick,
  icon,
  title,
  description,
  recommended,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
  recommended?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 text-left",
        selected
          ? "border-primary bg-primary/5"
          : "border-border/50 hover:border-border hover:bg-muted/30"
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
        selected ? "bg-primary/10" : "bg-muted/50"
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {recommended && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-medium">
              推荐
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className={cn(
        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
        selected ? "border-primary" : "border-muted-foreground/30"
      )}>
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
      </div>
    </button>
  )
}
