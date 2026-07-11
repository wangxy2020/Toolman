import {
  PmBaselineCreateInputSchema,
  PmBaselineDeleteInputSchema,
  PmBaselineGetInputSchema,
  PmBaselineListInputSchema,
} from '@toolman/shared'
import { PmScheduleBaselineRepository, PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'

function getBaselineRepo(): PmScheduleBaselineRepository {
  return new PmScheduleBaselineRepository(getDatabase())
}

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

export function listPmBaselines(input: unknown) {
  const data = PmBaselineListInputSchema.parse(input)
  const baselines = getBaselineRepo().listByProject(data.projectId, data.workspaceId)
  return { baselines }
}

export function getPmBaseline(input: unknown) {
  const data = PmBaselineGetInputSchema.parse(input)
  const baseline = getBaselineRepo().getById(data.id)
  if (!baseline) {
    throw new Error('基线不存在')
  }
  return baseline
}

export function createPmBaseline(input: unknown) {
  const data = PmBaselineCreateInputSchema.parse(input)
  const items = getWorkItemRepo().list({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    limit: 1000,
  })
  const capturedAt = Date.now()
  const name =
    data.name?.trim() ||
    `基线 ${new Date(capturedAt).toLocaleString('zh-CN', { hour12: false })}`

  const baseline = getBaselineRepo().create({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    name,
    snapshot: {
      capturedAt,
      workItems: items.map((item) => ({
        workItemId: item.id,
        title: item.title,
        startDate: item.startDate,
        dueDate: item.dueDate,
        progressPercent: item.progressPercent,
      })),
    },
  })
  return baseline
}

export function deletePmBaseline(input: unknown) {
  const data = PmBaselineDeleteInputSchema.parse(input)
  const existing = getBaselineRepo().getById(data.id)
  if (!existing) {
    throw new Error('基线不存在')
  }
  const deleted = getBaselineRepo().softDelete(data.id)
  if (!deleted) {
    throw new Error('基线不存在')
  }
  return { ok: true as const }
}
