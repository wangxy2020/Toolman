import {
  CommunityBoardMessageSchema,
  CommunityYjsStatusSchema,
  type CommunityBoardMessage,
} from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { listBoardMessages, getUserMe } from './community-ipc.facade'
import { isCommunityYjsEnabled, ensureDefaultCommunitySyncConfig, readCommunitySyncConfig, writeCommunitySyncConfig } from './community-yjs.config'
import {
  upsertLwwEntity,
  YJS_ORIGIN_BOOTSTRAP,
} from './community-yjs-store'
import {
  getCommunityYjsProviderStatus,
  startCommunityYjsProvider,
  stopCommunityYjsProvider,
} from './community-yjs-provider'

let hydrated = false

export async function bootstrapCommunityYjsFromHub(): Promise<void> {
  if (!isCommunityYjsEnabled() || hydrated) return

  try {
    const [board, profile] = await Promise.all([
      listBoardMessages({ limit: 100 }).catch(() => ({ items: [] as CommunityBoardMessage[] })),
      getUserMe().catch(() => null),
    ])

    for (const message of board.items) {
      const parsed = CommunityBoardMessageSchema.safeParse(message)
      if (!parsed.success) continue
      upsertLwwEntity(
        'board',
        parsed.data.id,
        parsed.data as unknown as Record<string, unknown>,
        { updatedAt: parsed.data.updatedAt },
        YJS_ORIGIN_BOOTSTRAP,
      )
    }

    if (profile) {
      upsertLwwEntity(
        'profiles',
        profile.id,
        profile as unknown as Record<string, unknown>,
        { updatedAt: profile.updatedAt ?? Date.now() },
        YJS_ORIGIN_BOOTSTRAP,
      )
    }

    hydrated = true
    recordDiagnosticEvent(
      'community-yjs',
      'info',
      `hydrated board=${board.items.length} profile=${profile ? 1 : 0}`,
    )
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    recordDiagnosticEvent('community-yjs', 'warn', `hydrate failed: ${message}`)
  }
}

export async function startCommunityYjsBridge(): Promise<void> {
  ensureDefaultCommunitySyncConfig()
  if (!isCommunityYjsEnabled()) return

  startCommunityYjsProvider()
  await bootstrapCommunityYjsFromHub()
}

export function getCommunityYjsStatus() {
  const status = getCommunityYjsProviderStatus()
  return CommunityYjsStatusSchema.parse(status)
}

export async function setCommunityYjsEnabled(enabled: boolean) {
  ensureDefaultCommunitySyncConfig()
  const current = readCommunitySyncConfig()
  if (current.yjsEnabled !== enabled) {
    writeCommunitySyncConfig({ ...current, yjsEnabled: enabled })
    recordDiagnosticEvent('community-yjs', 'info', enabled ? 'enabled via diagnostics' : 'disabled via diagnostics')
  }

  if (enabled) {
    startCommunityYjsProvider()
    await bootstrapCommunityYjsFromHub()
  } else {
    stopCommunityYjsProvider()
  }

  return getCommunityYjsStatus()
}
