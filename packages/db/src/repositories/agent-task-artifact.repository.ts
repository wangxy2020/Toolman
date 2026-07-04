import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  TaskArtifactSchema,
  type TaskArtifact,
  type TaskArtifactKind,
  type TaskArtifactSource,
} from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { agentTaskArtifacts } from '../schema/task-runtime.js'

export type AgentTaskArtifactRow = typeof agentTaskArtifacts.$inferSelect

export interface CreateAgentTaskArtifactInput {
  taskId: string
  name: string
  kind: TaskArtifactKind
  relativePath: string
  absolutePath: string
  mimeType?: string
  sizeBytes: number
  source?: TaskArtifactSource
  metadata?: Record<string, unknown>
}

function parseJsonObject<T extends Record<string, unknown>>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T
    }
    return fallback
  } catch {
    return fallback
  }
}

function parseSource(raw: string): TaskArtifactSource | undefined {
  const parsed = parseJsonObject<Record<string, unknown>>(raw, {})
  if (Object.keys(parsed).length === 0) return undefined
  const stepId = typeof parsed.stepId === 'string' ? parsed.stepId : undefined
  const toolName = typeof parsed.toolName === 'string' ? parsed.toolName : undefined
  const messageId = typeof parsed.messageId === 'string' ? parsed.messageId : undefined
  if (!stepId && !toolName && !messageId) return undefined
  return { stepId, toolName, messageId }
}

export function rowToTaskArtifact(row: AgentTaskArtifactRow): TaskArtifact {
  return TaskArtifactSchema.parse({
    id: row.id,
    taskId: row.taskId,
    name: row.name,
    kind: row.kind,
    relativePath: row.relativePath,
    absolutePath: row.absolutePath,
    mimeType: row.mimeType ?? undefined,
    sizeBytes: row.sizeBytes,
    source: parseSource(row.sourceJson),
    metadata: parseJsonObject(row.metadataJson, {}),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export class AgentTaskArtifactRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findRowById(id: string): AgentTaskArtifactRow | null {
    const row = this.db.select().from(agentTaskArtifacts).where(eq(agentTaskArtifacts.id, id)).get()
    if (!row || row.deletedAt) return null
    return row
  }

  getById(id: string): TaskArtifact | null {
    const row = this.findRowById(id)
    return row ? rowToTaskArtifact(row) : null
  }

  getByTaskAndId(taskId: string, artifactId: string): TaskArtifact | null {
    const row = this.findRowById(artifactId)
    if (!row || row.taskId !== taskId) return null
    return rowToTaskArtifact(row)
  }

  listByTask(taskId: string, limit = 100): TaskArtifact[] {
    return this.db
      .select()
      .from(agentTaskArtifacts)
      .where(and(eq(agentTaskArtifacts.taskId, taskId), isNull(agentTaskArtifacts.deletedAt)))
      .orderBy(desc(agentTaskArtifacts.createdAt))
      .limit(limit)
      .all()
      .map(rowToTaskArtifact)
  }

  findActiveByRelativePath(taskId: string, relativePath: string): TaskArtifact | null {
    const row = this.db
      .select()
      .from(agentTaskArtifacts)
      .where(
        and(
          eq(agentTaskArtifacts.taskId, taskId),
          eq(agentTaskArtifacts.relativePath, relativePath),
          isNull(agentTaskArtifacts.deletedAt),
        ),
      )
      .get()
    return row ? rowToTaskArtifact(row) : null
  }

  create(input: CreateAgentTaskArtifactInput): TaskArtifact {
    const now = new Date()
    const id = randomUUID()

    this.db
      .insert(agentTaskArtifacts)
      .values({
        id,
        taskId: input.taskId,
        name: input.name.trim(),
        kind: input.kind,
        relativePath: input.relativePath,
        absolutePath: input.absolutePath,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes,
        sourceJson: JSON.stringify(input.source ?? {}),
        metadataJson: JSON.stringify(input.metadata ?? {}),
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return this.getById(id)!
  }

  softDelete(taskId: string, artifactId: string): boolean {
    const row = this.findRowById(artifactId)
    if (!row || row.taskId !== taskId) return false

    const result = this.db
      .update(agentTaskArtifacts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentTaskArtifacts.id, artifactId))
      .run()

    return result.changes > 0
  }
}

export function createAgentTaskArtifactRepository(db: ToolmanDatabase): AgentTaskArtifactRepository {
  return new AgentTaskArtifactRepository(db)
}
