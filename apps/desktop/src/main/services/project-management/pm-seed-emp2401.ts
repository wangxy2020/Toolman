import type {
  PmProjectStatus,
  PmWorkItemPriority,
  PmWorkItemRelationType,
  PmWorkItemStatus,
  PmWorkItemType,
} from '@toolman/shared'
import { PM_BUILTIN_EMP_2401 } from '@toolman/shared'
import {
  PmProjectRepository,
  PmScheduleBaselineRepository,
  PmWorkItemRelationRepository,
  PmWorkItemRepository,
} from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'

function parseBuiltinCalendarDay(day: string): number {
  const [yearText, monthText, dayText] = day.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const dayOfMonth = Number(dayText)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(dayOfMonth)) {
    return Date.now()
  }
  return Date.UTC(year, month - 1, dayOfMonth, 12, 0, 0)
}

function asWorkItemStatus(value: string): PmWorkItemStatus {
  if (
    value === 'todo' ||
    value === 'in_progress' ||
    value === 'done' ||
    value === 'blocked' ||
    value === 'cancelled'
  ) {
    return value
  }
  return 'todo'
}

function asWorkItemPriority(value: string): PmWorkItemPriority {
  if (value === 'low' || value === 'normal' || value === 'high' || value === 'urgent') {
    return value
  }
  return 'normal'
}

function asWorkItemType(value: string): PmWorkItemType {
  if (
    value === 'task' ||
    value === 'milestone' ||
    value === 'phase' ||
    value === 'issue' ||
    value === 'wbs_node'
  ) {
    return value
  }
  return 'task'
}

function asRelationType(value: string): PmWorkItemRelationType {
  if (value === 'FS' || value === 'SS' || value === 'FF' || value === 'SF') {
    return value
  }
  return 'FS'
}

function asProjectStatus(value: string): PmProjectStatus {
  if (
    value === 'planning' ||
    value === 'active' ||
    value === 'on_hold' ||
    value === 'completed' ||
    value === 'archived'
  ) {
    return value
  }
  return 'active'
}

/**
 * Ensure EMP-2401 built-in owner-managed master plan exists with full WBS / FS links / baseline.
 * Does not overwrite an existing EMP-2401 project (any source) that already has work items.
 */
export function ensurePmBuiltinEmp2401(workspaceId: string): void {
  const seed = PM_BUILTIN_EMP_2401
  const projectRepo = new PmProjectRepository(getDatabase())
  const workItemRepo = new PmWorkItemRepository(getDatabase())
  const relationRepo = new PmWorkItemRelationRepository(getDatabase())
  const baselineRepo = new PmScheduleBaselineRepository(getDatabase())

  let project = projectRepo
    .listByWorkspace(workspaceId, { limit: 500 })
    .find((entry) => entry.code === seed.code)

  if (!project) {
    project = projectRepo.create({
      workspaceId,
      code: seed.code,
      name: seed.name,
      status: asProjectStatus(seed.status),
      domain: seed.domain,
      description: seed.description,
      metadata: { ...seed.metadata },
    })
  } else {
    // Fill EMP-2401 price-card currency defaults when missing on existing installs.
    const metadata = { ...(project.metadata ?? {}) }
    const rawCurrencies = metadata.costCurrencies
    const costCurrencies: Record<string, unknown> =
      rawCurrencies != null && typeof rawCurrencies === 'object' && !Array.isArray(rawCurrencies)
        ? { ...(rawCurrencies as Record<string, unknown>) }
        : {}
    let changed = false
    if (typeof metadata.costCurrency !== 'string' || !String(metadata.costCurrency).trim()) {
      metadata.costCurrency = '元'
      changed = true
    }
    if (
      typeof costCurrencies.investment !== 'string' ||
      !String(costCurrencies.investment).trim()
    ) {
      costCurrencies.investment = '万元'
      metadata.costCurrencies = costCurrencies
      changed = true
    }
    if (changed) {
      const updated = projectRepo.update(project.id, { metadata })
      if (updated) project = updated
    }
  }

  const existingItems = workItemRepo.list({
    workspaceId,
    projectId: project.id,
    domain: 'progress_management',
    limit: 1,
  })
  if (existingItems.length > 0) {
    return
  }

  const idByKey = new Map<string, string>()
  for (const itemSeed of seed.workItems) {
    const created = workItemRepo.create({
      workspaceId,
      projectId: project.id,
      domain: 'progress_management',
      parentId: itemSeed.parentKey ? idByKey.get(itemSeed.parentKey) : undefined,
      type: asWorkItemType(itemSeed.type),
      title: itemSeed.title,
      status: asWorkItemStatus(itemSeed.status),
      priority: asWorkItemPriority(itemSeed.priority),
      progressPercent: itemSeed.progressPercent,
      sortOrder: itemSeed.sortOrder,
      description: itemSeed.description,
      assignee: itemSeed.assignee,
      startDate: itemSeed.startDate ? parseBuiltinCalendarDay(itemSeed.startDate) : undefined,
      dueDate: itemSeed.dueDate ? parseBuiltinCalendarDay(itemSeed.dueDate) : undefined,
      metadata: {
        source: 'builtin',
        builtinKey: seed.metadata.builtinKey,
        seedKey: itemSeed.key,
      },
    })
    idByKey.set(itemSeed.key, created.id)
  }

  for (const relationSeed of seed.relations) {
    const fromWorkItemId = idByKey.get(relationSeed.fromKey)
    const toWorkItemId = idByKey.get(relationSeed.toKey)
    if (!fromWorkItemId || !toWorkItemId) continue
    relationRepo.create({
      workspaceId,
      projectId: project.id,
      fromWorkItemId,
      toWorkItemId,
      type: asRelationType(relationSeed.type),
      lagDays: relationSeed.lagDays,
    })
  }

  if (!seed.baselineName) return
  const existingBaselines = baselineRepo.listByProject(project.id, workspaceId)
  if (existingBaselines.length > 0) return

  const items = workItemRepo.list({
    workspaceId,
    projectId: project.id,
    domain: 'progress_management',
    limit: 1000,
  })
  const relations = relationRepo.listByProject(project.id, workspaceId)
  const capturedAt = Date.now()
  baselineRepo.create({
    workspaceId,
    projectId: project.id,
    name: seed.baselineName,
    snapshot: {
      capturedAt,
      workItems: items.map((item) => ({
        workItemId: item.id,
        title: item.title,
        ...(item.startDate != null ? { startDate: item.startDate } : {}),
        ...(item.dueDate != null ? { dueDate: item.dueDate } : {}),
        progressPercent: item.progressPercent,
        ...(item.parentId ? { parentWorkItemId: item.parentId } : {}),
        type: item.type,
        sortOrder: item.sortOrder,
      })),
      relations: relations.map((relation) => ({
        fromWorkItemId: relation.fromWorkItemId,
        toWorkItemId: relation.toWorkItemId,
        type: relation.type,
        lagDays: relation.lagDays,
      })),
    },
  })
}
