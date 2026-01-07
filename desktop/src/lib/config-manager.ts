import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface EnvConfig {
  [key: string]: string;
}

// 默认环境变量配置
const DEFAULT_CONFIG: EnvConfig = {
  // 存储配置
  CSS_SPARQL_ENDPOINT: 'sqlite:./data/quadstore.sqlite',
  CSS_IDENTITY_DB_URL: 'sqlite:./data/identity.sqlite',
  CSS_USAGE_DB_URL: 'sqlite:./data/usage.sqlite',
  CSS_ROOT_FILE_PATH: './data',

  // 运行模式
  CSS_EDITION: 'local',
  CSS_PORT: '3000',

  // 日志
  CSS_LOGGING_LEVEL: 'info',
  CSS_SHOW_STACK_TRACE: 'false',

  // 集群（默认关闭）
  CSS_EDGE_NODES_ENABLED: 'false',
  CSS_CLUSTER_INGRESS_DOMAIN: 'localhost',
};

// 环境变量分组和描述
export const ENV_SCHEMA = {
  storage: {
    label: '存储配置',
    vars: {
      CSS_SPARQL_ENDPOINT: {
        label: 'SPARQL 存储',
        description: 'SQLite 或 PostgreSQL 连接字符串',
        placeholder: 'sqlite:./data/quadstore.sqlite',
      },
      CSS_IDENTITY_DB_URL: {
        label: '身份数据库',
        description: '用户身份数据存储',
        placeholder: 'sqlite:./data/identity.sqlite',
      },
      CSS_USAGE_DB_URL: {
        label: '用量数据库',
        description: '使用统计数据存储',
        placeholder: 'sqlite:./data/usage.sqlite',
      },
      CSS_ROOT_FILE_PATH: {
        label: '数据目录',
        description: 'Pod 文件存储根目录',
        placeholder: './data',
      },
    },
  },
  server: {
    label: '服务配置',
    vars: {
      CSS_EDITION: {
        label: '运行模式',
        description: 'local = 本地模式, server = 服务器模式',
        placeholder: 'local',
        options: ['local', 'server'],
      },
      CSS_PORT: {
        label: '端口',
        description: '服务监听端口',
        placeholder: '3000',
      },
    },
  },
  logging: {
    label: '日志配置',
    vars: {
      CSS_LOGGING_LEVEL: {
        label: '日志级别',
        description: '日志详细程度',
        placeholder: 'info',
        options: ['error', 'warn', 'info', 'debug'],
      },
      CSS_SHOW_STACK_TRACE: {
        label: '显示堆栈',
        description: '错误时显示完整堆栈信息',
        placeholder: 'false',
        options: ['true', 'false'],
      },
    },
  },
  cluster: {
    label: '集群配置',
    vars: {
      CSS_EDGE_NODES_ENABLED: {
        label: '启用边缘节点',
        description: '是否启用边缘节点功能',
        placeholder: 'false',
        options: ['true', 'false'],
      },
      CSS_CLUSTER_INGRESS_DOMAIN: {
        label: '集群域名',
        description: '集群入口域名',
        placeholder: 'localhost',
      },
    },
  },
};

export class ConfigManager {
  private configPath: string;
  private config: EnvConfig = {};

  constructor(configDir?: string) {
    const baseDir = configDir || app.getPath('userData');
    this.configPath = path.join(baseDir, '.env');
    this.load();
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 加载配置
   */
  load(): EnvConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.config = this.parseEnvFile(content);
      } else {
        // 使用默认配置
        this.config = { ...DEFAULT_CONFIG };
        this.save();
      }
    } catch (err) {
      console.error('[ConfigManager] Failed to load config:', err);
      this.config = { ...DEFAULT_CONFIG };
    }
    return this.config;
  }

  /**
   * 保存配置
   */
  save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const content = this.serializeEnvFile(this.config);
      fs.writeFileSync(this.configPath, content, 'utf-8');
    } catch (err) {
      console.error('[ConfigManager] Failed to save config:', err);
      throw err;
    }
  }

  /**
   * 获取所有配置
   */
  getAll(): EnvConfig {
    return { ...this.config };
  }

  /**
   * 获取单个配置值
   */
  get(key: string): string | undefined {
    return this.config[key];
  }

  /**
   * 设置单个配置值
   */
  set(key: string, value: string): void {
    this.config[key] = value;
  }

  /**
   * 批量更新配置
   */
  update(updates: EnvConfig): void {
    this.config = { ...this.config, ...updates };
    this.save();
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }

  /**
   * 获取配置 schema（用于 UI 渲染）
   */
  getSchema(): typeof ENV_SCHEMA {
    return ENV_SCHEMA;
  }

  /**
   * 解析 .env 文件内容
   */
  private parseEnvFile(content: string): EnvConfig {
    const config: EnvConfig = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();

        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        config[key] = value;
      }
    }

    return config;
  }

  /**
   * 序列化为 .env 文件格式
   */
  private serializeEnvFile(config: EnvConfig): string {
    const lines: string[] = [
      '# LinX Desktop Configuration',
      '# Generated by LinX Desktop',
      '',
    ];

    // 按 schema 分组输出
    for (const [groupKey, group] of Object.entries(ENV_SCHEMA)) {
      lines.push(`# ${group.label}`);
      for (const varKey of Object.keys(group.vars)) {
        if (config[varKey] !== undefined) {
          lines.push(`${varKey}=${config[varKey]}`);
        }
      }
      lines.push('');
    }

    // 输出不在 schema 中的自定义变量
    const schemaKeys = new Set(
      Object.values(ENV_SCHEMA).flatMap(g => Object.keys(g.vars))
    );
    const customKeys = Object.keys(config).filter(k => !schemaKeys.has(k));
    if (customKeys.length > 0) {
      lines.push('# 自定义配置');
      for (const key of customKeys) {
        lines.push(`${key}=${config[key]}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
