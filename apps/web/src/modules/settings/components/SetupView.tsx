import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import type { SetupConfig, DeploymentMode, TunnelProvider, NetworkDetectionResult, NetworkAccessMode } from '../types'

interface SetupViewProps {
  onComplete?: (config: SetupConfig) => void
}

export function SetupView({ onComplete }: SetupViewProps) {
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>('local')
  const [dataDir, setDataDir] = useState('')
  const [autoStart, setAutoStart] = useState(true)

  // Local mode
  const [localSubdomain, setLocalSubdomain] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [domainLoading, setDomainLoading] = useState(true)

  // Standalone mode
  const [standaloneDomain, setStandaloneDomain] = useState('')
  const [certPath, setCertPath] = useState('')

  // Network
  const [networkStatus, setNetworkStatus] = useState<NetworkDetectionResult | null>(null)
  const [networkLoading, setNetworkLoading] = useState(true)
  const [tunnelProvider, setTunnelProvider] = useState<TunnelProvider | ''>('')
  const [tunnelToken, setTunnelToken] = useState('')

  const [submitting, setSubmitting] = useState(false)

  // Initialize: allocate domain and detect network
  useEffect(() => {
    initLocalMode()
  }, [])

  async function initLocalMode() {
    // 1. Get default data dir and allocate domain
    setDomainLoading(true)
    try {
      // Generate device ID and subdomain
      const id = generateDeviceId()
      setDeviceId(id)
      setLocalSubdomain(id.substring(0, 8))

      // Set default data dir based on platform
      const defaultDir = getDefaultDataDir()
      setDataDir(defaultDir)
    } catch (err) {
      console.error('Failed to allocate domain:', err)
    } finally {
      setDomainLoading(false)
    }

    // 2. Detect network
    setNetworkLoading(true)
    try {
      const result = await detectNetwork()
      setNetworkStatus(result)
    } catch (err) {
      setNetworkStatus({ reachable: false, method: 'none' })
    } finally {
      setNetworkLoading(false)
    }
  }

  function generateDeviceId(): string {
    // Generate a device fingerprint from random bytes
    const array = new Uint8Array(8)
    crypto.getRandomValues(array)
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
  }

  function getDefaultDataDir(): string {
    // In browser, we can't detect platform easily
    // This would be set by Electron in desktop mode
    if (typeof window !== 'undefined' && (window as any).__LINX_SERVICE__) {
      return '~/Library/Application Support/LinX/pod'
    }
    return '~/.linx/pod'
  }

  async function detectNetwork(): Promise<NetworkDetectionResult> {
    try {
      // Try to get public IP via external service
      const response = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(5000)
      })
      const data = await response.json()

      if (data.ip) {
        // Check if it's a private IP
        const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(data.ip)
        if (!isPrivate) {
          return { reachable: true, method: 'public-ip', ip: data.ip }
        }
      }
    } catch (err) {
      console.error('Network detection failed:', err)
    }

    return { reachable: false, method: 'none' }
  }

  async function handleSubmit() {
    // Determine network access mode
    const accessMode: NetworkAccessMode = tunnelProvider ? 'tunnel' : 'auto'

    // Validate
    if (deploymentMode === 'local' && !networkStatus?.reachable && !tunnelProvider) {
      alert('网络不可达，请配置隧道服务')
      return
    }

    if (deploymentMode === 'standalone' && !standaloneDomain) {
      alert('请输入域名')
      return
    }

    setSubmitting(true)

    const config: SetupConfig = {
      edition: 'local',
      deploymentMode,
      pod: {
        port: 5737,
        dataDir,
      },
      local: {
        deviceId,
        subdomain: localSubdomain,
      },
      standalone: {
        customDomain: standaloneDomain || undefined,
        certPath: certPath || undefined,
      },
      network: {
        accessMode,
        tunnelProvider: tunnelProvider || undefined,
        tunnelToken: tunnelToken || undefined,
      },
      autoStart,
    }

    // Check if running in LinX Service mode
    const isServiceMode = typeof window !== 'undefined' && (window as any).__LINX_SERVICE__

    if (isServiceMode) {
      // Call API to save setup config
      try {
        const response = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataDir,
            autoStart,
            network: config.network,
          }),
        })

        if (!response.ok) {
          throw new Error('保存配置失败')
        }

        console.log('[Setup] Configuration saved successfully')
      } catch (err) {
        console.error('[Setup] Failed to save config:', err)
        alert('保存配置失败: ' + (err instanceof Error ? err.message : '未知错误'))
        setSubmitting(false)
        return
      }
    } else {
      // Output as JSON config (matches LinxConfig structure)
      console.log('Setup config:', JSON.stringify(config, null, 2))
    }

    onComplete?.(config)
    setSubmitting(false)
  }

  const needsTunnel = deploymentMode === 'local' && !networkStatus?.reachable

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-lg bg-card border-border/50 shadow-lg shadow-black/5 rounded-2xl">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-500 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">L</span>
          </div>
          <CardTitle className="text-2xl">欢迎使用 LinX</CardTitle>
          <CardDescription>配置你的本地 Pod 服务</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Data Directory */}
          <div className="space-y-2">
            <Label>数据目录</Label>
            <Input
              value={dataDir}
              onChange={(e) => setDataDir(e.target.value)}
              placeholder="~/Library/Application Support/LinX/pod"
              className="rounded-xl border-border/60 bg-muted/50 focus:bg-background focus:border-primary/50"
            />
            <p className="text-xs text-muted-foreground">Pod 数据将存储在此目录</p>
          </div>

          {/* Auto Start */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
            <Label htmlFor="autoStart" className="cursor-pointer">开机时自动启动</Label>
            <Switch
              id="autoStart"
              checked={autoStart}
              onCheckedChange={setAutoStart}
            />
          </div>

          {/* Deployment Mode Tabs */}
          <Tabs value={deploymentMode} onValueChange={(v: string) => setDeploymentMode(v as DeploymentMode)}>
            <TabsList className="grid w-full grid-cols-2 bg-muted/50 rounded-xl">
              <TabsTrigger value="local" className="rounded-lg data-[state=active]:bg-primary/20">
                本地模式
                <Badge variant="secondary" className="ml-2 bg-primary text-primary-foreground text-[10px] px-1.5">
                  推荐
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="standalone" className="rounded-lg data-[state=active]:bg-primary/20">
                独立模式
              </TabsTrigger>
            </TabsList>

            {/* Local Mode */}
            <TabsContent value="local" className="space-y-4 mt-4">
              {/* Domain */}
              <div className="space-y-2">
                <Label>域名</Label>
                <Input
                  value={domainLoading ? '分配中...' : `${localSubdomain}.undefineds.xyz`}
                  disabled
                  className="rounded-xl border-border/60 bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">系统自动分配 DDNS</p>
              </div>

              {/* Network Status */}
              <div className="space-y-2">
                <Label>网络状态</Label>
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                  networkLoading
                    ? 'bg-muted/30 border-border/50'
                    : networkStatus?.reachable
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-amber-500/10 border-amber-500/30'
                }`}>
                  {networkLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">检测中...</span>
                    </>
                  ) : networkStatus?.reachable ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-emerald-400">
                        公网 IP: {networkStatus.ip}，无需配置隧道
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-amber-400">
                        未检测到公网 IP，需要配置隧道
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Tunnel Service */}
              <div className="space-y-2">
                <Label>
                  隧道服务
                  {needsTunnel && (
                    <span className="text-amber-500 text-xs ml-2">(必填)</span>
                  )}
                </Label>
                <div className="flex gap-3">
                  <Select value={tunnelProvider} onValueChange={(v) => setTunnelProvider(v as TunnelProvider)}>
                    <SelectTrigger className="w-36 rounded-xl border-border/60 bg-muted/50">
                      <SelectValue placeholder="不使用" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">不使用</SelectItem>
                      <SelectItem value="cloudflare">Cloudflare</SelectItem>
                      <SelectItem value="sakura">SakuraFRP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={tunnelToken}
                    onChange={(e) => setTunnelToken(e.target.value)}
                    placeholder="Token"
                    disabled={!tunnelProvider}
                    className="flex-1 rounded-xl border-border/60 bg-muted/50"
                  />
                </div>
                <p className="text-xs text-muted-foreground">如果网络不可达，需要配置隧道</p>
              </div>
            </TabsContent>

            {/* Standalone Mode */}
            <TabsContent value="standalone" className="space-y-4 mt-4">
              {/* Domain */}
              <div className="space-y-2">
                <Label>域名</Label>
                <Input
                  value={standaloneDomain}
                  onChange={(e) => setStandaloneDomain(e.target.value)}
                  placeholder="pod.example.com"
                  className="rounded-xl border-border/60 bg-muted/50 focus:bg-background focus:border-primary/50"
                />
                <p className="text-xs text-muted-foreground">你的自定义域名</p>
              </div>

              {/* Tunnel Service */}
              <div className="space-y-2">
                <Label>隧道服务 (可选)</Label>
                <div className="flex gap-3">
                  <Select value={tunnelProvider} onValueChange={(v) => setTunnelProvider(v as TunnelProvider)}>
                    <SelectTrigger className="w-36 rounded-xl border-border/60 bg-muted/50">
                      <SelectValue placeholder="不使用" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">不使用</SelectItem>
                      <SelectItem value="cloudflare">Cloudflare</SelectItem>
                      <SelectItem value="sakura">SakuraFRP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={tunnelToken}
                    onChange={(e) => setTunnelToken(e.target.value)}
                    placeholder="Token"
                    disabled={!tunnelProvider}
                    className="flex-1 rounded-xl border-border/60 bg-muted/50"
                  />
                </div>
                <p className="text-xs text-muted-foreground">如果没有公网 IP，可使用隧道服务</p>
              </div>

              {/* Certificate Path */}
              <div className="space-y-2">
                <Label>证书路径 (可选)</Label>
                <Input
                  value={certPath}
                  onChange={(e) => setCertPath(e.target.value)}
                  placeholder="/path/to/cert.pem"
                  className="rounded-xl border-border/60 bg-muted/50 focus:bg-background focus:border-primary/50"
                />
                <p className="text-xs text-muted-foreground">不填则自动申请 Let's Encrypt</p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-2xl h-12 bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                设置中...
              </>
            ) : (
              '开始使用 LinX'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
