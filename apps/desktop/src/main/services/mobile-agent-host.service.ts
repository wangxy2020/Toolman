/**
 * Desktop agent host presence / relay hooks for mobile clients (feature-flagged).
 *
 * Mobile knowledge sync is scoped to `kind === 'sync'` bases only
 * （桌面「同步知识库」分区），不含本地 / 网络 / 共享等其它分区。
 * Classroom textbook binding may list all vectorized KBs via `list-classroom-kb`.
 */
import {
  KnowledgeHostRequestSchema,
  isSyncKnowledgeBaseKind,
  isVectorizedKnowledgeBaseKind,
  type AgentHostCapability,
  type AgentHostPresence,
  type KnowledgeMetaItem,
} from '@toolman/shared'
import {
  isMobileAgentHostPreferenceEnabled,
  readMobileSyncPreferences,
  writeMobileSyncPreferences,
} from './mobile-sync.config'
import { isMobileSyncEnabled } from './mobile-sync.service'
import { createKnowledgeBase, listKnowledgeBases } from './knowledge.service'
import { searchKnowledge } from './knowledge-document.service'
import { getDefaultWorkspace } from './workspace.service'
import { publishKnowledgeMetaChanges } from './mobile-sync-store'
import { logStructured } from './structured-log.service'
import { startAssistantLibSyllabusGeneration } from './assistant-lib-syllabus.service'
import { getSession } from './session.service'
import { DEFAULT_LOCAL_MODEL } from '@toolman/db'
import { DEFAULT_PROVIDER_ID } from '../bootstrap/database-defaults'

function requireWorkspaceId(): string {
  const workspace = getDefaultWorkspace()
  if (!workspace) throw new Error('未找到默认工作区')
  return workspace.id
}

/** Knowledge bases under desktop「同步知识库」— the only ones mobile may sync/search. */
function listMobileSyncKnowledgeMeta(workspaceId: string): KnowledgeMetaItem[] {
  return listKnowledgeBases({ workspaceId })
    .filter((kb) => isSyncKnowledgeBaseKind(kb.kind))
    .map((kb) => ({
      id: kb.id,
      name: kb.name,
      kind: kb.kind,
      documentCount: kb.documentCount,
      updatedAt: kb.updatedAt,
    }))
}

function listClassroomBindableKnowledgeMeta(workspaceId: string): KnowledgeMetaItem[] {
  return listKnowledgeBases({ workspaceId })
    .filter((kb) => isVectorizedKnowledgeBaseKind(kb.kind))
    .map((kb) => ({
      id: kb.id,
      name: kb.name,
      kind: kb.kind,
      documentCount: kb.documentCount,
      updatedAt: kb.updatedAt,
    }))
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
  const syncItems = listMobileSyncKnowledgeMeta(workspaceId)

  if (request.op === 'list-meta') {
    publishKnowledgeMetaChanges(syncItems)
    return { ok: true, text: JSON.stringify({ op: 'list-meta', items: syncItems }) }
  }

  if (request.op === 'list-classroom-kb') {
    const items = listClassroomBindableKnowledgeMeta(workspaceId)
    return { ok: true, text: JSON.stringify({ op: 'list-classroom-kb', items }) }
  }

  if (request.op === 'generate-syllabus') {
    const session = getSession(request.sessionId)
    if (!session) {
      return {
        ok: false,
        text: '桌面端尚未找到该课程会话。请先开启课堂同步并等待同步完成后再生成大纲。',
      }
    }
    const modelId = request.modelId?.trim() || `${DEFAULT_PROVIDER_ID}:${DEFAULT_LOCAL_MODEL}`
    const result = await startAssistantLibSyllabusGeneration({
      workspaceId,
      sessionId: request.sessionId,
      modelId,
    })
    return {
      ok: true,
      text: JSON.stringify({
        op: 'generate-syllabus',
        started: result.started,
        message: result.started
          ? '已开始生成教学大纲，完成后会同步到手机'
          : '大纲正在生成中，请稍候',
      }),
    }
  }

  if (request.op === 'create-classroom-kb') {
    const name = request.name.trim()
    const kb = createKnowledgeBase({
      workspaceId,
      name,
      description: request.description?.trim() || `课堂课程教材（${name}）`,
      kind: 'local',
    })
    return {
      ok: true,
      text: JSON.stringify({
        op: 'create-classroom-kb',
        item: {
          id: kb.id,
          name: kb.name,
          kind: kb.kind,
          documentCount: kb.documentCount,
          updatedAt: kb.updatedAt,
        },
      }),
    }
  }

  const syncKbIds = new Set(syncItems.map((item) => item.id))
  if (request.kbId && !syncKbIds.has(request.kbId)) {
    return {
      ok: false,
      text: '仅支持检索「同步知识库」中的内容',
    }
  }

  const kbIds = request.kbId ? [request.kbId] : Array.from(syncKbIds)
  if (kbIds.length === 0) {
    return {
      ok: true,
      text: JSON.stringify({ op: 'search', items: [] }),
    }
  }

  const hits = await searchKnowledge({
    workspaceId,
    query: request.query,
    kbIds,
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

/** Publish current sync-KB metadata into the Sync changelog for mobile pull. */
export function publishActiveKnowledgeMeta(): void {
  if (!isMobileSyncEnabled()) return
  try {
    const workspaceId = requireWorkspaceId()
    publishKnowledgeMetaChanges(listMobileSyncKnowledgeMeta(workspaceId))
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
