import type { McpServerConfig } from '@toolman/shared'

export const EMPTY_STDIO_DRAFT: McpServerConfig = {
  id: '',
  name: '',
  description: '',
  type: 'stdio',
  enabled: true,
  command: '',
  args: [],
  env: {},
  packageSource: 'default',
  longRunning: false,
  timeoutSeconds: 60,
}

export function parseArgsInput(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function parseEnvInput(value: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of value.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

export function formatEnv(env?: Record<string, string>): string {
  if (!env || Object.keys(env).length === 0) return ''
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

export function parseTagsInput(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function formatTags(tags?: string[]): string {
  return (tags ?? []).join(', ')
}

export function applyPackageSource(config: McpServerConfig): McpServerConfig {
  if (config.packageSource !== 'taobao' || config.command?.trim() !== 'npx') {
    return config
  }
  return {
    ...config,
    env: {
      ...config.env,
      NPM_CONFIG_REGISTRY: 'https://registry.npmmirror.com',
    },
  }
}
