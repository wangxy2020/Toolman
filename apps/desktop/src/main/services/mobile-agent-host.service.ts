/**
 * Desktop agent host presence / relay hooks for mobile clients (feature-flagged).
 */
import {
  KnowledgeHostRequestSchema,
  type AgentHostCapability,
  type AgentHostPresence,
} from '@toolman/shared'
import {
  isMobileAgentHostPreferenceEnabled,
  readMobileSyncPreferences,
  writeMobileSyncPreferences,
} from './mobile-sync.config'
import { isMobileSyncEnabled } from './mobile-sync.service'
import { listKnowledgeBases } from './knowledge.service'
import { searchKnowledge } from './knowledge-document.service'
import { getDefaultWorkspace } from './workspace.service'
import { publishKnowledgeMetaChanges } from './mobile-sync-store'
import { logStructured } from './structured-log.service'

function requireWorkspaceId(): string {
  const workspace = getDefaultWorkspace()
  if (!workspace) throw new Error('未找到默认工作区')
  return workspace.id
}

export function isMobileAgentHostEnabled(): boolean {
  return isMobileAgentHostPreferenceEnabled()
}

let identityId: string | null = null
let deviceId: string | null = null

export function configureMobileAgentHost(options: {
  identityId: string
  deviceId: string
}): void {
  identityId = options.identityId
  deviceId = options.deviceId
}

export function buildMobileAgentHostPresence(
  capabilities: AgentHostCapability[] = [
    'agent',
    'classroom',
    'project-management',
    'knowledge-search',
  ],
): AgentHostPresence | null {
  if (!isMobileAgentHostEnabled() || !identityId || !deviceId) return null
  return {
    deviceId,
    identityId,
    deviceKind: 'desktop',
    agentHost: true,
    capabilities,
    displayName: 'Toolman Desktop',
    lastSeenAt: Date.now(),
  }
}

async function handleKnowledgeHostMessage(message: string): Promise<{ ok: boolean; text: string }> {
  let parsed: unknown = message
  try {
    parsed = JSON.parse(message)
  } catch {
    parsed = { op: 'search', query: message, limit: 8 }
  }
  const request = KnowledgeHostRequestSchema.parse(parsed)
  const workspaceId = requireWorkspaceId()

  if (request.op === 'list-meta') {
    const items = listKnowledgeBases({ workspaceId }).map((kb) => ({
      id: kb.id,
      name: kb.name,
      kind: kb.kind,
      documentCount: kb.documentCount,
      updatedAt: kb.updatedAt,
    }))
    publishKnowledgeMetaChanges(items)
    return { ok: true, text: JSON.stringify({ op: 'list-meta', items }) }
  }

  const hits = await searchKnowledge({
    workspaceId,
    query: request.query,
    kbIds: request.kbId ? [request.kbId] : undefined,
    topK: request.limit ?? 8,
  })
  return {
    ok: true,
    text: JSON.stringify({
      op: 'search',
      items: hits.map((hit) => ({
        documentTitle: hit.documentTitle,
        kbName: hit.kbName,
        score: hit.score,
        text: hit.text,
        sourcePath: hit.sourcePath ?? null,
      })),
    }),
  }
}

/**
 * Handle an inbound mobile invoke. Knowledge-search runs local LanceDB/FTS;
 * other capabilities echo until full agent streaming relay is wired.
 */
export async function handleMobileAgentHostInvoke(input: {
  capability: AgentHostCapability
  message: string
}): Promise<{ ok: boolean; text: string }> {
  if (!isMobileAgentHostEnabled()) {
    return {
      ok: false,
      text: '桌面宿主未启用（请在设置 → 系统诊断 → 移动端同步中开启）',
    }
  }

  if (input.capability === 'knowledge-search') {
    try {
      return await handleKnowledgeHostMessage(input.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logStructured('mobile-sync', 'warn', `knowledge-search failed: ${message}`)
      return { ok: false, text: message }
    }
  }

  return {
    ok: true,
    text: `[desktop-host:${input.capability}] 收到移动端请求：${input.message.slice(0, 200)}`,
  }
}

/** Publish current KB metadata into the Sync changelog for mobile pull. */
export function publishActiveKnowledgeMeta(): void {
  if (!isMobileSyncEnabled()) return
  try {
    const workspaceId = requireWorkspaceId()
    const items = listKnowledgeBases({ workspaceId }).map((kb) => ({
      id: kb.id,
      name: kb.name,
      kind: kb.kind,
      documentCount: kb.documentCount,
      updatedAt: kb.updatedAt,
    }))
    publishKnowledgeMetaChanges(items)
  } catch (error) {
    logStructured('mobile-sync', 'warn', `publish knowledge meta failed: ${String(error)}`)
  }
}

export function setMobileAgentHostPreferenceEnabled(enabled: boolean) {
  const current = readMobileSyncPreferences()
  return writeMobileSyncPreferences({
    ...current,
    // Host requires sync hub; enabling host implies enabling sync.
    syncEnabled: enabled ? true : current.syncEnabled,
    agentHostEnabled: enabled,
  })
}
