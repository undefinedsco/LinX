import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Supervisor } from '../../../../lib/supervisor';
import { ConfigManager } from './config-manager';
import { ProviderManager } from './provider-manager';

export interface XpodStartOptions {
  providerId: string;
  dataDir: string;
  port: number;
  domain?: {
    type: 'none' | 'undefineds' | 'custom';
    value?: string;
  };
  tunnelToken?: string;
}

export interface XpodStatus {
  running: boolean;
  providerId?: string;
  port?: number;
  baseUrl?: string;
  pid?: number;
}

export class XpodManager {
  private supervisor: Supervisor;
  private configManager: ConfigManager;
  private providerManager: ProviderManager;
  private currentProviderId: string | null = null;

  constructor(
    supervisor: Supervisor,
    configManager: ConfigManager,
    providerManager: ProviderManager
  ) {
    this.supervisor = supervisor;
    this.configManager = configManager;
    this.providerManager = providerManager;
  }

  /**
   * 获取 xpod 根目录
   */
  private getXpodRoot(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'xpod');
    }

    // 开发模式：尝试 vendor/xpod
    const vendorXpod = path.join(__dirname, '..', '..', '..', '..', 'vendor', 'xpod');
    if (fs.existsSync(vendorXpod)) {
      return fs.realpathSync(vendorXpod);
    }

    // 回退：外部 xpod 目录
    const externalXpod = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'xpod');
    if (fs.existsSync(externalXpod)) {
      return externalXpod;
    }

    console.error('[XpodManager] xpod not found! Run: yarn link:xpod');
    return vendorXpod;
  }

  /**
   * 启动 xpod
   */
  async start(options: XpodStartOptions): Promise<void> {
    const { providerId, dataDir, port, domain, tunnelToken } = options;

    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 构建 BASE_URL
    let baseUrl: string;
    if (domain?.value) {
      baseUrl = `https://${domain.value}`;
    } else {
      baseUrl = `http://localhost:${port}`;
    }

    // 获取基础配置
    const envConfig = this.configManager.getAll();
    const xpodRoot = this.getXpodRoot();

    console.log(`[XpodManager] Starting xpod from: ${xpodRoot}`);
    console.log(`[XpodManager] Data dir: ${dataDir}`);
    console.log(`[XpodManager] Base URL: ${baseUrl}`);

    // 构建环境变量
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      ...envConfig,
      CSS_PORT: port.toString(),
      CSS_ROOT_FILE_PATH: dataDir,
      CSS_BASE_URL: baseUrl,
    };

    // 如果有隧道 token，传给 xpod（xpod 自己管理隧道）
    if (tunnelToken) {
      env.CLOUDFLARE_TUNNEL_TOKEN = tunnelToken;
    }

    // 注册并启动服务
    this.supervisor.register({
      name: 'xpod',
      command: 'node',
      args: ['dist/main.js'],
      cwd: xpodRoot,
      env,
    });

    // 更新 Provider 状态
    this.providerManager.updateManagedStatus(providerId, 'starting');
    this.currentProviderId = providerId;

    this.supervisor.start('xpod');

    // 等待服务就绪
    await this.waitForReady(port);

    // 更新状态为运行中
    this.providerManager.updateManagedStatus(providerId, 'running');
  }

  /**
   * 停止 xpod
   */
  async stop(): Promise<void> {
    await this.supervisor.stop('xpod');

    if (this.currentProviderId) {
      try {
        this.providerManager.updateManagedStatus(this.currentProviderId, 'stopped');
      } catch (e) {
        // Provider 可能已被删除
      }
      this.currentProviderId = null;
    }
  }

  /**
   * 重启 xpod
   */
  async restart(): Promise<void> {
    const provider = this.currentProviderId
      ? this.providerManager.get(this.currentProviderId)
      : null;

    await this.stop();

    if (provider?.managed) {
      await this.start({
        providerId: provider.id,
        dataDir: provider.managed.dataDir,
        port: provider.managed.port,
        domain: provider.managed.domain,
        tunnelToken: provider.managed.tunnelToken,
      });
    }
  }

  /**
   * 获取 xpod 状态
   */
  getStatus(): XpodStatus {
    const allStatus = this.supervisor.getAllStatus();
    const xpodState = allStatus.find(s => s.name === 'xpod');

    if (!xpodState || xpodState.status !== 'running') {
      return { running: false };
    }

    const provider = this.currentProviderId
      ? this.providerManager.get(this.currentProviderId)
      : null;

    return {
      running: true,
      providerId: this.currentProviderId || undefined,
      port: provider?.managed?.port,
      baseUrl: provider?.managed?.domain?.value
        ? `https://${provider.managed.domain.value}`
        : provider?.managed?.port
        ? `http://localhost:${provider.managed.port}`
        : undefined,
      pid: xpodState.pid,
    };
  }

  /**
   * 等待 xpod 就绪
   */
  private async waitForReady(port: number, maxRetries = 30): Promise<void> {
    const url = `http://localhost:${port}/.well-known/solid`;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          console.log('[XpodManager] xpod is ready');
          return;
        }
      } catch (e) {
        // 继续重试
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error('xpod failed to start within timeout');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    const status = this.getStatus();
    if (!status.running || !status.port) {
      return false;
    }

    try {
      const url = `http://localhost:${status.port}/.well-known/solid`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  }
}
