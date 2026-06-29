import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  AssistantCreateInputSchema,
  AssistantDeleteInputSchema,
  AssistantDuplicateInputSchema,
  AssistantListInputSchema,
  AssistantParametersSchema,
  AssistantSchema,
  AssistantUpdateInputSchema,
  type Assistant,
} from '@toolman/shared'
import { assistants } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'
import { getSessionRepository } from '../db/repos'

function parseAssistantParameters(raw: Record<string, unknown>) {
  const result = AssistantParametersSchema.safeParse(raw)
  if (result.success) return result.data
  return AssistantParametersSchema.parse({ temperature: 0.7 })
}

function mergeParameters(
  existing: Record<string, unknown>,
  patch?: Record<string, unknown>,
) {
  return parseAssistantParameters({ ...existing, ...patch })
}

function parseKbIdsFromPatch(patch?: Record<string, unknown>): string[] | undefined {
  if (!patch || !('kbIds' in patch)) return undefined
  const raw = patch.kbIds
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string')
}

function toAssistant(row: typeof assistants.$inferSelect): Assistant {
  const params = JSON.parse(row.parametersJson)
  let kbIds: string[] = []
  try {
    const parsed = JSON.parse(row.kbIdsJson) as unknown
    if (Array.isArray(parsed)) {
      kbIds = parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    kbIds = []
  }

  return AssistantSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description ?? undefined,
    systemPrompt: row.systemPrompt,
    modelId: row.modelId,
    parameters: {
      ...parseAssistantParameters(params),
      kbIds: kbIds.length > 0 ? kbIds : undefined,
    },
    isBuiltin: row.isBuiltin,
    isPinned: row.isPinned,
  })
}

export function getAssistantRow(id: string) {
  const row = getAssistantRowIncludingDeleted(id)
  if (!row || row.deletedAt) return null
  return row
}

export function getAssistantRowIncludingDeleted(id: string) {
  const db = getDatabase()
  return db.select().from(assistants).where(eq(assistants.id, id)).get() ?? null
}

export function isBuiltinAssistantId(assistantId: string): boolean {
  return getAssistantRowIncludingDeleted(assistantId)?.isBuiltin === true
}

/** Group mirror import must never overwrite built-in assistants (e.g. 通用智能体). */
export function resolveGroupMirrorImportAssistantId(
  existingAssistantId?: string,
): string | undefined {
  if (!existingAssistantId || isBuiltinAssistantId(existingAssistantId)) {
    return undefined
  }
  return existingAssistantId
}

const BUILTIN_ASSISTANT_NAME = '通用智能体'
const BUILTIN_ASSISTANT_DESCRIPTION = '默认 AI 对话智能体'

/** Strip group mirror/proxy flags from a built-in assistant and restore its default identity. */
export function releaseBuiltinAssistantFromGroupScope(
  assistantId: string,
  p2pWorkspaceId: string,
): void {
  const existing = getAssistantRowIncludingDeleted(assistantId)
  if (!existing?.isBuiltin) return

  restoreAssistantIfDeleted(assistantId)
  const row = getAssistantRowIncludingDeleted(assistantId)
  if (!row) return

  const params = JSON.parse(row.parametersJson) as Record<string, unknown>
  const mirror = params.p2pGroupSharedMirror as { p2pWorkspaceId?: string } | undefined
  const proxy = params.p2pGroupProxy as { p2pWorkspaceId?: string } | undefined
  if (mirror?.p2pWorkspaceId !== p2pWorkspaceId && proxy?.p2pWorkspaceId !== p2pWorkspaceId) {
    return
  }

  const nextParams = { ...params }
  if (mirror?.p2pWorkspaceId === p2pWorkspaceId) {
    delete nextParams.p2pGroupSharedMirror
  }
  if (proxy?.p2pWorkspaceId === p2pWorkspaceId) {
    delete nextParams.p2pGroupProxy
  }

  updateAssistant({
    id: assistantId,
    name: BUILTIN_ASSISTANT_NAME,
    description: BUILTIN_ASSISTANT_DESCRIPTION,
    parameters: nextParams,
  })
}

export function restoreAssistantIfDeleted(id: string): boolean {
  const row = getAssistantRowIncludingDeleted(id)
  if (!row) return false
  if (!row.deletedAt) return true

  const db = getDatabase()
  db.update(assistants)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(assistants.id, id))
    .run()
  return true
}

export function listAssistants(input: unknown): Assistant[] {
  const data = AssistantListInputSchema.parse(input)
  const db = getDatabase()

  const rows = db
    .select()
    .from(assistants)
    .where(eq(assistants.workspaceId, data.workspaceId))
    .all()

  return rows
    .filter((r: typeof assistants.$inferSelect) => !r.deletedAt && (data.pinnedOnly ? r.isPinned : true))
    .map(toAssistant)
}

export function createAssistant(input: unknown): Assistant {
  const data = AssistantCreateInputSchema.parse(input)
  const db = getDatabase()
  const now = new Date()
  const id = randomUUID()

  const parameters = mergeParameters({}, data.parameters as Record<string, unknown> | undefined)
  const kbIds = parseKbIdsFromPatch(data.parameters as Record<string, unknown> | undefined) ?? []

  db.insert(assistants)
    .values({
      id,
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      systemPrompt: data.systemPrompt,
      modelId: data.modelId,
      parametersJson: JSON.stringify(parameters),
      kbIdsJson: JSON.stringify(kbIds),
      isBuiltin: false,
      isPinned: data.isPinned,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return toAssistant(getAssistantRow(id)!)
}

export function updateAssistant(input: unknown): Assistant | null {
  const data = AssistantUpdateInputSchema.parse(input)
  const db = getDatabase()
  const existing = getAssistantRow(data.id)
  if (!existing) return null

  const params = JSON.parse(existing.parametersJson) as Record<string, unknown>
  const nextParams = mergeParameters(params, data.parameters as Record<string, unknown> | undefined)
  const kbIdsPatch = parseKbIdsFromPatch(data.parameters as Record<string, unknown> | undefined)

  const now = new Date()
  db.update(assistants)
    .set({
      name: data.name ?? existing.name,
      description:
        data.description !== undefined ? data.description : existing.description,
      systemPrompt: data.systemPrompt ?? existing.systemPrompt,
      modelId: data.modelId ?? existing.modelId,
      parametersJson: JSON.stringify(nextParams),
      ...(kbIdsPatch !== undefined ? { kbIdsJson: JSON.stringify(kbIdsPatch) } : {}),
      isPinned: data.isPinned ?? existing.isPinned,
      updatedAt: now,
    })
    .where(eq(assistants.id, data.id))
    .run()

  return toAssistant(getAssistantRow(data.id)!)
}

export function deleteAssistant(input: unknown): {
  deleted: boolean
  deletedSessionIds: string[]
} {
  const data = AssistantDeleteInputSchema.parse(input)
  const db = getDatabase()
  const existing = getAssistantRow(data.id)
  if (!existing) return { deleted: false, deletedSessionIds: [] }

  if (existing.isBuiltin) {
    throw new Error('内置助手不可删除')
  }

  const params = JSON.parse(existing.parametersJson) as Record<string, unknown>
  if (params.p2pGroupSharedMirror) {
    throw new Error('群组共享镜像智能体不可直接删除，请先从群组移除')
  }

  const deletedSessionIds = getSessionRepository().deleteByAssistantId(data.id)

  const result = db
    .update(assistants)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(assistants.id, data.id))
    .run()

  return { deleted: result.changes > 0, deletedSessionIds }
}

export function duplicateAssistant(input: unknown): Assistant | null {
  const data = AssistantDuplicateInputSchema.parse(input)
  const existing = getAssistantRow(data.id)
  if (!existing) return null

  const now = new Date()
  const id = randomUUID()
  const db = getDatabase()

  db.insert(assistants)
    .values({
      id,
      workspaceId: existing.workspaceId,
      name: data.name ?? `${existing.name}（副本）`,
      description: existing.description,
      systemPrompt: existing.systemPrompt,
      modelId: existing.modelId,
      parametersJson: existing.parametersJson,
      kbIdsJson: existing.kbIdsJson,
      isBuiltin: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return toAssistant(getAssistantRow(id)!)
}
