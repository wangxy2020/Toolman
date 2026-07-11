import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

import {
  PmDomainSettingsGetInputSchema,
  PmDomainSettingsSchema,
  PmDomainSettingsSetInputSchema,
  type PmDomain,
  type PmDomainSettings,
} from '@toolman/shared'

const SETTINGS_FILE = 'pm-domain-settings.json'

type SettingsStore = Record<string, PmDomainSettings>

function settingsKey(workspaceId: string, domain: PmDomain): string {
  return `${workspaceId}:${domain}`
}

function settingsPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, SETTINGS_FILE)
}

function readStore(): SettingsStore {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const store: SettingsStore = {}
    for (const [key, value] of Object.entries(parsed)) {
      const settings = PmDomainSettingsSchema.safeParse(value)
      if (settings.success) {
        store[key] = settings.data
      }
    }
    return store
  } catch {
    return {}
  }
}

function writeStore(store: SettingsStore): void {
  writeFileSync(settingsPath(), JSON.stringify(store, null, 2), 'utf8')
}

export function getPmDomainSettings(workspaceId: string, domain: PmDomain): PmDomainSettings {
  const store = readStore()
  return (
    store[settingsKey(workspaceId, domain)] ?? {
      workspaceId,
      domain,
      p2pAutoSync: false,
      linkedP2pWorkspaceIds: [],
    }
  )
}

export function setPmDomainSettings(rawInput: unknown): PmDomainSettings {
  const input = PmDomainSettingsSetInputSchema.parse(rawInput)
  const store = readStore()
  store[settingsKey(input.workspaceId, input.domain)] = input
  writeStore(store)
  return input
}

export function getPmDomainSettingsIpc(rawInput: unknown): { settings: PmDomainSettings } {
  const input = PmDomainSettingsGetInputSchema.parse(rawInput)
  return { settings: getPmDomainSettings(input.workspaceId, input.domain) }
}
