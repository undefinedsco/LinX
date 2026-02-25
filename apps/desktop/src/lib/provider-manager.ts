import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface ManagedPodConfig {
  status: 'stopped' | 'starting' | 'running' | 'error';
  dataDir: string;
  port: number;
  domain: {
    type: 'none' | 'undefineds' | 'custom';
    value?: string; // alice.pods.undefineds.co 或 pod.example.com
  };
  tunnelToken?: string;
}

export interface SolidProvider {
  id: string;
  name: string;
  issuerUrl: string;
  isDefault?: boolean;
  // 仅本地管理的 Pod 有此字段
  managed?: ManagedPodConfig;
}

export interface ProvidersData {
  defaultId: string;
  providers: SolidProvider[];
}

// 默认 Provider 列表
const DEFAULT_PROVIDERS: ProvidersData = {
  defaultId: 'undefineds',
  providers: [
    {
      id: 'undefineds',
      name: 'Undefineds Pod',
      issuerUrl: 'https://pods.undefineds.co',
      isDefault: true,
    },
  ],
};

export class ProviderManager {
  private dataPath: string;
  private data: ProvidersData;

  constructor(configDir?: string) {
    const baseDir = configDir || app.getPath('userData');
    this.dataPath = path.join(baseDir, 'providers.json');
    this.data = this.load();
  }

  /**
   * 加载 Provider 数据
   */
  private load(): ProvidersData {
    try {
      if (fs.existsSync(this.dataPath)) {
        const content = fs.readFileSync(this.dataPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      console.error('[ProviderManager] Failed to load providers:', err);
    }
    return { ...DEFAULT_PROVIDERS };
  }

  /**
   * 保存 Provider 数据
   */
  private save(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ProviderManager] Failed to save providers:', err);
      throw err;
    }
  }

  /**
   * 获取所有 Provider
   */
  list(): SolidProvider[] {
    return [...this.data.providers];
  }

  /**
   * 获取单个 Provider
   */
  get(id: string): SolidProvider | undefined {
    return this.data.providers.find(p => p.id === id);
  }

  /**
   * 获取默认 Provider
   */
  getDefault(): SolidProvider | undefined {
    return this.data.providers.find(p => p.id === this.data.defaultId);
  }

  /**
   * 添加 Provider
   */
  add(provider: SolidProvider): void {
    // 检查 ID 是否已存在
    if (this.data.providers.some(p => p.id === provider.id)) {
      throw new Error(`Provider with id '${provider.id}' already exists`);
    }
    this.data.providers.push(provider);
    this.save();
  }

  /**
   * 更新 Provider
   */
  update(id: string, updates: Partial<SolidProvider>): void {
    const index = this.data.providers.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Provider with id '${id}' not found`);
    }
    this.data.providers[index] = { ...this.data.providers[index], ...updates };
    this.save();
  }

  /**
   * 删除 Provider
   */
  remove(id: string): void {
    const index = this.data.providers.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Provider with id '${id}' not found`);
    }
    // 不能删除默认 Provider
    if (id === this.data.defaultId) {
      throw new Error('Cannot remove default provider');
    }
    this.data.providers.splice(index, 1);
    this.save();
  }

  /**
   * 设置默认 Provider
   */
  setDefault(id: string): void {
    if (!this.data.providers.some(p => p.id === id)) {
      throw new Error(`Provider with id '${id}' not found`);
    }
    // 更新 isDefault 标记
    this.data.providers.forEach(p => {
      p.isDefault = p.id === id;
    });
    this.data.defaultId = id;
    this.save();
  }

  /**
   * 更新托管 Pod 状态
   */
  updateManagedStatus(id: string, status: ManagedPodConfig['status']): void {
    const provider = this.get(id);
    if (!provider?.managed) {
      throw new Error(`Provider '${id}' is not a managed pod`);
    }
    provider.managed.status = status;
    this.update(id, { managed: provider.managed });
  }

  /**
   * 查找本地托管的 Pod
   */
  getManagedPods(): SolidProvider[] {
    return this.data.providers.filter(p => p.managed);
  }

  /**
   * 通过 URL 检测 Provider 是否是有效的 Solid Pod
   */
  async detectProvider(url: string): Promise<{
    success: boolean;
    issuer?: string;
    name?: string;
    error?: string;
  }> {
    try {
      const baseUrl = new URL(url);
      const oidcUrl = new URL('/.well-known/openid-configuration', baseUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(oidcUrl.toString(), {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const config = await response.json() as { issuer?: string };
        return {
          success: true,
          issuer: config.issuer,
          name: baseUrl.hostname,
        };
      }

      return { success: false, error: 'not-solid' };
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return { success: false, error: 'timeout' };
      }
      return { success: false, error: 'connection-failed' };
    }
  }
}
