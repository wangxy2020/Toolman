import {
  PmBaselineCreateInputSchema,
  PmBaselineUpdateInputSchema,
  parseVersionPlanSnapshotName,
  versionPlanSnapshotName,
} from '@toolman/shared'

import {
  applyShouldPercentFromAsOfDate,
  captureScheduleSnapshot,
  formatAsOfDateLabel,
  getBaselineRepo,
  parseAsOfDateInput,
  startOfLocalDayMs,
} from './pm-baseline-read'

export function createPmBaseline(input: unknown) {
  const data = PmBaselineCreateInputSchema.parse(input)
  // Prefer schema field; fall back to raw payload if an older shared build stripped asOfDate.
  const rawAsOf =
    data.asOfDate ??
    (input && typeof input === 'object' && typeof (input as { asOfDate?: unknown }).asOfDate === 'string'
      ? (input as { asOfDate: string }).asOfDate
      : undefined)
  const asOfDate = parseAsOfDateInput(rawAsOf) ?? startOfLocalDayMs(Date.now())
  const name =
    data.name?.trim() ||
    `基线 ${formatAsOfDateLabel(asOfDate)}`
  const snapshot = captureScheduleSnapshot(data.workspaceId, data.projectId, asOfDate)

  // Version plan snapshots are unique per schedule version (upsert).
  // User baselines are independent — many baselines may exist for one version.
  const version = parseVersionPlanSnapshotName(name)
  if (version != null) {
    const repo = getBaselineRepo()
    const sameVersion = repo
      .listByProject(data.projectId, data.workspaceId)
      .filter((entry) => parseVersionPlanSnapshotName(entry.name) === version)
    const preferredName = versionPlanSnapshotName(version)
    const keep =
      sameVersion.find((entry) => entry.name === preferredName) ?? sameVersion[0]
    const duplicates = sameVersion.filter((entry) => entry.id !== keep?.id)
    for (const duplicate of duplicates) {
      repo.softDelete(duplicate.id)
    }
    if (keep) {
      // Migrate legacy `版本 N` rows to the reserved version-plan name.
      const updated = repo.updateSnapshot(keep.id, snapshot, preferredName)
      if (updated) return updated
    }
    const soft = repo.findSoftDeletedVersionPlan(data.projectId, data.workspaceId, version)
    if (soft) {
      const revived = repo.undeleteAndUpdateSnapshot(soft.id, snapshot, preferredName)
      if (revived) return revived
    }
    return getBaselineRepo().create({
      workspaceId: data.workspaceId,
      projectId: data.projectId,
      name: preferredName,
      snapshot,
    })
  }

  const created = getBaselineRepo().create({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    name,
    snapshot,
  })
  // User baselines: refresh 应完成百分比 so Gantt/前锋线 can compare vs 实际完成.
  applyShouldPercentFromAsOfDate(data.workspaceId, data.projectId, asOfDate)
  return created
}

/** Update user baseline name, as-of date, and/or snapshot progress patches. */
export function updatePmBaseline(input: unknown) {
  const data = PmBaselineUpdateInputSchema.parse(input)
  // Prefer schema field; fall back to raw payload if an older shared build stripped it.
  const rawProgress =
    data.workItemProgress ??
    (input &&
    typeof input === 'object' &&
    Array.isArray((input as { workItemProgress?: unknown }).workItemProgress)
      ? (
          input as {
            workItemProgress: Array<{ workItemId: string; progressPercent: number }>
          }
        ).workItemProgress
      : undefined)
  const existing = getBaselineRepo().getById(data.id)
  if (!existing) {
    throw new Error('基线不存在')
  }
  if (parseVersionPlanSnapshotName(existing.name) != null) {
    throw new Error('版本计划快照不能在此修改；请在项目信息中管理保存记录')
  }
  if (data.name == null && data.asOfDate == null && (rawProgress == null || rawProgress.length === 0)) {
    return existing
  }

  const name = data.name?.trim() || existing.name
  let snapshot = existing.snapshot
  let asOfDate: number | null = null
  if (data.asOfDate != null) {
    asOfDate = parseAsOfDateInput(data.asOfDate)
    if (asOfDate == null) {
      throw new Error('请输入有效日期，格式为 YYYY-MM-DD')
    }
    snapshot = { ...snapshot, asOfDate }
  }
  if (rawProgress != null && rawProgress.length > 0) {
    const progressById = new Map(
      rawProgress
        .filter(
          (entry) =>
            entry &&
            typeof entry.workItemId === 'string' &&
            typeof entry.progressPercent === 'number' &&
            Number.isFinite(entry.progressPercent),
        )
        .map(
          (entry) =>
            [
              entry.workItemId,
              Math.min(100, Math.max(0, Math.floor(entry.progressPercent))),
            ] as const,
        ),
    )
    let patched = 0
    snapshot = {
      ...snapshot,
      workItems: snapshot.workItems.map((item) => {
        const next = progressById.get(item.workItemId)
        if (next == null) return item
        patched += 1
        return { ...item, progressPercent: next }
      }),
    }
    if (patched === 0) {
      throw new Error('基线快照中未找到对应任务，无法保存实际完成百分比')
    }
  }

  const updated = getBaselineRepo().updateSnapshot(existing.id, snapshot, name)
  if (!updated) {
    throw new Error('基线不存在')
  }
  if (asOfDate != null) {
    applyShouldPercentFromAsOfDate(existing.workspaceId, existing.projectId, asOfDate)
  }
  return updated
}

