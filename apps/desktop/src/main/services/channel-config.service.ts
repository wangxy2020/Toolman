import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  CHANNEL_PLATFORMS,
  DEFAULT_CHANNEL_WEBHOOK_PORT,
  ImChannelConfigSchema,
  ImChannelUpsertInputSchema,
  type ChannelPlatformId,
  type ImChannelConfig,
  type ImChannelConfigPublic,
} from '@toolman/shared'
import { decryptSecret, encryptSecret } from './secret-store'

const CONFIG_FILE = 'im-channels.json'

interface StoredChannelConfig {
  platform: ChannelPlatformId
  enabled: boolean
  name: string
  assistantId: string
  appId: string
  appSecretRef?: string
  encryptKeyRef?: string
  verificationToken: string
  domain: string
  allowedChatIds: string
}

interface StoredConfigFile {
  webhookPort: number
  platforms: Partial<Record<ChannelPlatformId, StoredChannelConfig>>
}

function configPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, CONFIG_FILE)
}

function defaultPlatformConfig(platform: ChannelPlatformId): StoredChannelConfig {
  const meta = CHANNEL_PLATFORMS.find((item) => item.id === platform)
  return {
    platform,
    enabled: false,
    name: meta?.name ?? platform,
    assistantId: '',
    appId: '',
    verificationToken: '',
    domain: meta?.defaultDomain ?? '',
    allowedChatIds: '',
  }
}

function readStoredFile(): StoredConfigFile {
  const path = configPath()
  if (!existsSync(path)) {
    return {
      webhookPort: DEFAULT_CHANNEL_WEBHOOK_PORT,
      platforms: {},
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredConfigFile
    return {
      webhookPort: parsed.webhookPort ?? DEFAULT_CHANNEL_WEBHOOK_PORT,
      platforms: parsed.platforms ?? {},
    }
  } catch {
    return {
      webhookPort: DEFAULT_CHANNEL_WEBHOOK_PORT,
      platforms: {},
    }
  }
}

function writeStoredFile(data: StoredConfigFile): void {
  writeFileSync(configPath(), JSON.stringify(data, null, 2), 'utf8')
}

function decryptField(ref?: string): string {
  if (!ref) return ''
  return decryptSecret(ref) ?? ''
}

function encryptField(value: string, previousRef?: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed) return encryptSecret(trimmed)
  return previousRef
}

function toRuntimeConfig(stored: StoredChannelConfig): ImChannelConfig {
  return ImChannelConfigSchema.parse({
    ...stored,
    appSecret: decryptField(stored.appSecretRef),
    encryptKey: decryptField(stored.encryptKeyRef),
  })
}

function toPublicConfig(stored: StoredChannelConfig): ImChannelConfigPublic {
  const { appSecretRef, encryptKeyRef, ...rest } = stored
  return {
    ...rest,
    hasAppSecret: Boolean(appSecretRef),
    hasEncryptKey: Boolean(encryptKeyRef),
  }
}

export function getWebhookPort(): number {
  return readStoredFile().webhookPort
}

export function listImChannelConfigsPublic(): {
  webhookPort: number
  items: ImChannelConfigPublic[]
} {
  const file = readStoredFile()
  const items = CHANNEL_PLATFORMS.map((platform) => {
    const stored = file.platforms[platform.id] ?? defaultPlatformConfig(platform.id)
    return toPublicConfig(stored)
  })
  return { webhookPort: file.webhookPort, items }
}

export function getImChannelConfig(platform: ChannelPlatformId): ImChannelConfig | null {
  const file = readStoredFile()
  const stored = file.platforms[platform]
  if (!stored) return null
  return toRuntimeConfig(stored)
}

export function listEnabledImChannelConfigs(): ImChannelConfig[] {
  const file = readStoredFile()
  return CHANNEL_PLATFORMS.map((platform) => file.platforms[platform.id] ?? defaultPlatformConfig(platform.id))
    .filter((item) => item.enabled)
    .map(toRuntimeConfig)
}

export function upsertImChannelConfig(input: unknown): ImChannelConfigPublic {
  const data = ImChannelUpsertInputSchema.parse(input)
  const file = readStoredFile()
  const previous = file.platforms[data.platform] ?? defaultPlatformConfig(data.platform)

  const nextStored: StoredChannelConfig = {
    platform: data.platform,
    enabled: data.enabled ?? previous.enabled,
    name: data.name ?? previous.name,
    assistantId: data.assistantId ?? previous.assistantId,
    appId: data.appId ?? previous.appId,
    verificationToken: data.verificationToken ?? previous.verificationToken,
    domain: data.domain ?? previous.domain,
    allowedChatIds: data.allowedChatIds ?? previous.allowedChatIds,
    appSecretRef: encryptField(data.appSecret ?? '', previous.appSecretRef),
    encryptKeyRef: encryptField(data.encryptKey ?? '', previous.encryptKeyRef),
  }

  file.platforms[data.platform] = nextStored
  writeStoredFile(file)
  return toPublicConfig(nextStored)
}
