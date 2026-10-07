/**
 * xpod Edition - 对齐 xpod 的 XPOD_EDITION 环境变量
 * - local: 本地独立运行
 * - cloud: 云端集群模式
 */
export type XpodEdition = 'local' | 'cloud'

/**
 * 空间类型
 * - local: 本地托管模式，IdP 在 Cloud，SP 在本地（推荐）
 * - standalone: 独立模式，IdP + SP 都在本地
 */
export type ServiceSpaceKind = 'local' | 'standalone'

/**
 * 网络接入方式
 * - auto: 自动检测 (公网IP > IPv6 > UPnP)
 * - tunnel: 使用隧道服务商
 */
export type NetworkAccessMode = 'auto' | 'tunnel'

/**
 * 隧道服务商
 */
export type TunnelProvider = 'cloudflare' | 'sakura'

/**
 * 本地托管模式配置 - 连接 Cloud IdP
 */
export interface LocalConfig {
  /** SP 节点 ID，用于 Cloud 识别这个存储服务节点 */
  nodeId?: string
  /** 设备 ID，用于标识可以运行本地 workspace 的设备 */
  deviceId?: string
  /** 节点 Token，用于与 Cloud 通信 (XPOD_NODE_TOKEN) */
  nodeToken?: string
}

/**
 * 独立模式配置 - 自管理身份
 */
export interface StandaloneConfig {
  /** 自定义域名 (CSS_BASE_URL) */
  customDomain?: string
  /** 外部 OIDC issuer，用于 SP 模式 */
  oidcIssuer?: string
  /** 证书路径 */
  certPath?: string
}

/**
 * 网络配置
 */
export interface NetworkConfig {
  /** 网络接入方式 */
  accessMode: NetworkAccessMode
  /** 隧道服务商 */
  tunnelProvider?: TunnelProvider
  /** 隧道 Token (CLOUDFLARE_TUNNEL_TOKEN / SAKURA_TOKEN) */
  tunnelToken?: string
}

/**
 * 设置数据 - 对齐 xpod 的环境变量
 *
 * 映射关系：
 * - edition -> XPOD_EDITION
 * - pod.port -> XPOD_PORT / CSS_PORT
 * - pod.dataDir -> 用于生成 CSS_SPARQL_ENDPOINT, CSS_IDENTITY_DB_URL
 * - local.nodeId -> XPOD_NODE_ID / LINX_NODE_ID
 * - local.deviceId -> LINX_DEVICE_ID
 * - local.nodeToken -> XPOD_NODE_TOKEN
 * - standalone.customDomain -> CSS_BASE_URL
 * - standalone.oidcIssuer -> oidcIssuer
 * - network.tunnelToken -> CLOUDFLARE_TUNNEL_TOKEN / SAKURA_TOKEN
 */
export interface SetupConfig {
  /** xpod 运行版本 */
  edition: XpodEdition
  /** 空间类型 */
  spaceKind: ServiceSpaceKind
  pod: {
    port: number
    dataDir: string
  }
  local: LocalConfig
  standalone: StandaloneConfig
  network: NetworkConfig
  autoStart: boolean
  /** 数据加密密钥 (XPOD_ENCRYPTION_KEY) */
  encryptionKey?: string
}

/**
 * 网络检测结果
 */
export interface NetworkDetectionResult {
  reachable: boolean
  method: 'public-ip' | 'ipv6' | 'upnp' | 'none'
  ip?: string
}
