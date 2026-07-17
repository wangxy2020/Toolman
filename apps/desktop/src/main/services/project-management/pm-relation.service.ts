import {
  PmRelationCreateInputSchema,
  PmRelationDeleteInputSchema,
  PmRelationListInputSchema,
} from '@toolman/shared'
import { PmWorkItemRelationRepository, PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { ensurePmDemoRelationsForProject } from './pm-seed.service'

function getRelationRepo(): PmWorkItemRelationRepository {
  return new PmWorkItemRelationRepository(getDatabase())
}

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

export function listPmRelations(input: unknown) {
  const data = PmRelationListInputSchema.parse(input)
  // Repair missing demo FS links for seeded mock projects only (seedKey metadata).
  ensurePmDemoRelationsForProject(data.workspaceId, data.projectId)
  const relations = getRelationRepo().listByProject(data.projectId, data.workspaceId)
  return { relations }
}

export function createPmRelation(input: unknown) {
  const data = PmRelationCreateInputSchema.parse(input)
  if (data.fromWorkItemId === data.toWorkItemId) {
    throw new Error('不能将工作项与自身建立依赖')
  }
  const fromItem = getWorkItemRepo().getById(data.fromWorkItemId)
  const toItem = getWorkItemRepo().getById(data.toWorkItemId)
  if (!fromItem || !toItem) {
    throw new Error('依赖的工作项不存在')
  }
  if (fromItem.projectId !== data.projectId || toItem.projectId !== data.projectId) {
    throw new Error('依赖须属于同一项目')
  }
  const relation = getRelationRepo().create({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    fromWorkItemId: data.fromWorkItemId,
    toWorkItemId: data.toWorkItemId,
    type: data.type,
    lagDays: data.lagDays,
  })
  return relation
}

export function deletePmRelation(input: unknown) {
  const data = PmRelationDeleteInputSchema.parse(input)
  const existing = getRelationRepo().getById(data.id)
  const deleted = getRelationRepo().softDelete(data.id)
  if (!deleted || !existing) {
    throw new Error('依赖关系不存在')
  }
  return { ok: true as const }
}
