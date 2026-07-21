import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  hasAppliedPlanFingerprint,
  parsePmFullPlanFromText,
  parsePmScheduleSuggestionsFromText,
  readAppliedPlanReceipts,
  readScheduleVersion,
  resolvePmPlanApplyAction,
  upsertAppliedPlanReceipt,
  versionPlanSnapshotName,
  type Message,
  type PmProject,
  type PmProjectPlan,
  type PmWbsSuggestion,
} from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { getMessageText } from '../chat/message-utils'
import { pmApi } from './pm-api'
import {
  markSessionPendingAgentRevision,
  pendingAgentRevisionMetadataPatch,
} from './pm-pending-revision'
import type { PmNewProjectBriefValues } from './PmNewProjectBriefForm'
import { pmScheduleApi } from './views/schedule/pm-schedule-api'

export type PmPendingNewProjectBrief = PmNewProjectBriefValues

function storageKey(workspaceId: string): string {
  return `tm-pm-plan-applied:${workspaceId}`
}

/** Optimistic session cache; durable source of truth is project metadata receipts. */
function readAppliedMap(workspaceId: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAppliedMap(workspaceId: string, map: Record<string, string>): void {
  try {
    sessionStorage.setItem(storageKey(workspaceId), JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

/** Drop apply fingerprints that point at a deleted / missing project. */
export function clearPmPlanAppliedProject(workspaceId: string, projectId: string): void {
  const map = readAppliedMap(workspaceId)
  let changed = false
  for (const [fingerprint, appliedId] of Object.entries(map)) {
    if (appliedId === projectId) {
      delete map[fingerprint]
      changed = true
    }
  }
  if (changed) writeAppliedMap(workspaceId, map)
}

/** Stable fingerprint so remount / message-id churn cannot re-apply the same plan. */
export function buildPmPlanFingerprint(
  wbs: PmWbsSuggestion[],
  projectPlan?: PmProjectPlan,
  projectName?: string | null,
): string {
  return JSON.stringify({
    name: projectName?.trim() || '',
    plan: projectPlan ?? null,
    wbs: wbs.map((item) => ({
      title: item.title,
      parentTitle: item.parentTitle ?? null,
      type: item.type ?? null,
      startDate: item.startDate ?? null,
      dueDate: item.dueDate ?? null,
      durationDays: item.durationDays ?? null,
      predecessors: item.predecessors ?? [],
    })),
  })
}

function findAppliedProjectId(
  projects: PmProject[],
  fingerprint: string,
  workspaceId: string,
): string | null {
  if (!fingerprint) return null
  for (const project of projects) {
    if (hasAppliedPlanFingerprint(project.metadata, fingerprint)) {
      return project.id
    }
  }
  const sessionId = readAppliedMap(workspaceId)[fingerprint]
  if (sessionId && projects.some((project) => project.id === sessionId)) {
    return sessionId
  }
  return null
}

interface Props {
  workspaceId: string
  messages: Message[]
  projects: PmProject[]
  selectedProjectId: string | null
  pendingBrief: PmPendingNewProjectBrief | null
  onPlanApplied: (projectId: string) => void
  onBriefConsumed?: () => void
  /** Refresh project list after metadata / apply changes. */
  onProjectsChange?: () => void | Promise<void>
}

/** Compact green text confirm / jump for the assistant message action row. */
export function ProjectPlanAgentApplyBar({
  workspaceId,
  messages,
  projects,
  selectedProjectId,
  pendingBrief,
  onPlanApplied,
  onBriefConsumed,
  onProjectsChange,
}: Props) {
  const { t } = useI18n()
  const [applying, setApplying] = useState(false)
  /** Local override so UI flips to 跳转 immediately even if parent remounts mid-navigate. */
  const [localAppliedProjectId, setLocalAppliedProjectId] = useState<string | null>(null)
  const applyingRef = useRef(false)

  const lastAssistant = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message?.role === 'assistant') return message
    }
    return null
  }, [messages])

  const lastAssistantText = lastAssistant ? getMessageText(lastAssistant) : ''

  const parsedPlan = useMemo(
    () => parsePmFullPlanFromText(lastAssistantText),
    [lastAssistantText],
  )
  const wbsSuggestions = parsedPlan.wbs
  const scheduleSuggestions = useMemo(
    () => parsePmScheduleSuggestionsFromText(lastAssistantText),
    [lastAssistantText],
  )

  const canApplyPlan = wbsSuggestions.length > 0
  const canApplyScheduleOnly = !canApplyPlan && scheduleSuggestions.length > 0
  const hasSuggestion = canApplyPlan || canApplyScheduleOnly

  const fingerprint = useMemo(() => {
    if (!canApplyPlan) {
      return `schedule:${JSON.stringify(scheduleSuggestions)}`
    }
    // Do not include project name — pendingBrief is cleared after apply and would
    // change the fingerprint, causing a duplicate write on the next click.
    return buildPmPlanFingerprint(wbsSuggestions, parsedPlan.projectPlan, null)
  }, [canApplyPlan, parsedPlan.projectPlan, scheduleSuggestions, wbsSuggestions])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  // Keep local apply state in sync with durable receipts (+ session optimistic cache).
  useEffect(() => {
    if (!workspaceId || !fingerprint) {
      setLocalAppliedProjectId(null)
      return
    }
    const stored = findAppliedProjectId(projects, fingerprint, workspaceId)
    setLocalAppliedProjectId(stored)
  }, [fingerprint, projects, workspaceId])

  const appliedProjectId = (() => {
    const id =
      localAppliedProjectId ?? findAppliedProjectId(projects, fingerprint, workspaceId)
    if (!id) return null
    if (!projects.some((project) => project.id === id)) return null
    return id
  })()

  const applyAction = useMemo(() => {
    if (appliedProjectId) return 'goToGantt' as const
    const hasAnyPriorReceipt = selectedProject
      ? readAppliedPlanReceipts(selectedProject.metadata).length > 0
      : false
    return resolvePmPlanApplyAction({
      fingerprint,
      fingerprintAlreadyApplied: false,
      // Button label: first apply = 确定; later plans on same project = 重新应用.
      // Destructive confirm still runs for both when clearing an existing project.
      hasLiveWorkItems: false,
      hasAnyPriorReceipt,
    })
  }, [appliedProjectId, fingerprint, selectedProject])

  const markApplied = useCallback(
    async (projectId: string) => {
      setLocalAppliedProjectId(projectId)
      const map = readAppliedMap(workspaceId)
      map[fingerprint] = projectId
      writeAppliedMap(workspaceId, map)
      try {
        const fresh = await pmApi.getProject(projectId)
        await pmApi.updateProject({
          id: projectId,
          metadata: {
            ...upsertAppliedPlanReceipt(fresh.metadata, fingerprint),
            ...pendingAgentRevisionMetadataPatch(),
          },
        })
        await onProjectsChange?.()
      } catch {
        // Session map still prevents immediate double-apply in this session.
      }
    },
    [fingerprint, onProjectsChange, workspaceId],
  )

  /** Ensure Save can bump version even if project-list metadata is stale. */
  const markPendingRevision = useCallback(
    async (projectId: string) => {
      markSessionPendingAgentRevision(workspaceId, projectId)
      try {
        await pmApi.updateProject({
          id: projectId,
          metadata: pendingAgentRevisionMetadataPatch(),
        })
      } catch {
        // Session flag still lets Save bump; DB flag is best-effort.
      }
    },
    [workspaceId],
  )

  /** Protect current version plan snapshot before destructive clearExisting. */
  const protectCurrentVersionBaseline = useCallback(
    async (project: PmProject) => {
      const version = readScheduleVersion(project.metadata)
      if (version <= 0) return
      try {
        await pmScheduleApi.createBaseline(workspaceId, project.id, {
          name: versionPlanSnapshotName(version),
        })
      } catch {
        // Best-effort; apply should still proceed.
      }
    },
    [workspaceId],
  )

  const confirmDestructiveApply = useCallback(
    (action: 'confirm' | 'reapply', projectName: string): boolean => {
      if (action === 'reapply') {
        return window.confirm(
          t('projectManagerPage.agent.applyReapplyConfirm', { name: projectName }),
        )
      }
      return window.confirm(
        t('projectManagerPage.agent.applyOverwriteConfirm', { name: projectName }),
      )
    },
    [t],
  )

  const handleApplyPlan = useCallback(async () => {
    if (!canApplyPlan || !lastAssistant || applyingRef.current) return

    const existingApplied = findAppliedProjectId(projects, fingerprint, workspaceId)
    if (existingApplied) {
      onPlanApplied(existingApplied)
      return
    }

    applyingRef.current = true
    setApplying(true)
    try {
      const createName = pendingBrief?.name.trim() || null

      if (createName) {
        const existing = projects.find(
          (project) => project.name.trim().toLowerCase() === createName.trim().toLowerCase(),
        )
        let clearExisting = false
        if (existing) {
          const confirmed = window.confirm(
            t('projectManagerPage.agent.applyNameConflictConfirm', { name: createName }),
          )
          if (!confirmed) return
          clearExisting = true
          await protectCurrentVersionBaseline(existing)
        }

        const result = await pmApi.applyWbsSuggestions({
          workspaceId,
          suggestions: wbsSuggestions,
          scheduleSuggestions:
            scheduleSuggestions.length > 0 ? scheduleSuggestions : undefined,
          projectPlan: parsedPlan.projectPlan,
          createProject: {
            name: createName,
            description: pendingBrief?.overview,
            clearExisting,
          },
        })
        await markApplied(result.projectId)
        await markPendingRevision(result.projectId)
        onBriefConsumed?.()
        onPlanApplied(result.projectId)
        return
      }

      if (!selectedProjectId || !selectedProject) {
        window.alert(t('projectManagerPage.agent.applyNeedProject'))
        return
      }

      let hasLiveWorkItems = true
      try {
        const listed = await pmApi.listWorkItems({
          workspaceId,
          projectId: selectedProjectId,
          limit: 1,
        })
        hasLiveWorkItems = listed.items.length > 0
      } catch {
        hasLiveWorkItems = true
      }

      const action = resolvePmPlanApplyAction({
        fingerprint,
        fingerprintAlreadyApplied: false,
        hasLiveWorkItems,
        hasAnyPriorReceipt: readAppliedPlanReceipts(selectedProject.metadata).length > 0,
      })
      if (hasLiveWorkItems || action === 'reapply') {
        if (
          !confirmDestructiveApply(
            action === 'reapply' ? 'reapply' : 'confirm',
            selectedProject.name,
          )
        ) {
          return
        }
      }

      await protectCurrentVersionBaseline(selectedProject)

      const result = await pmApi.applyWbsSuggestions({
        workspaceId,
        suggestions: wbsSuggestions,
        scheduleSuggestions:
          scheduleSuggestions.length > 0 ? scheduleSuggestions : undefined,
        projectPlan: parsedPlan.projectPlan,
        createProject: {
          name: selectedProject.name,
          clearExisting: true,
        },
      })
      await markApplied(result.projectId)
      await markPendingRevision(result.projectId)
      onPlanApplied(result.projectId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      applyingRef.current = false
      setApplying(false)
    }
  }, [
    canApplyPlan,
    confirmDestructiveApply,
    fingerprint,
    lastAssistant,
    markApplied,
    markPendingRevision,
    onBriefConsumed,
    onPlanApplied,
    parsedPlan.projectPlan,
    pendingBrief,
    projects,
    protectCurrentVersionBaseline,
    scheduleSuggestions,
    selectedProject,
    selectedProjectId,
    t,
    wbsSuggestions,
    workspaceId,
  ])

  const handleApplySchedule = useCallback(async () => {
    if (!selectedProjectId || !selectedProject || !lastAssistant) return
    if (scheduleSuggestions.length === 0) return
    if (applyingRef.current) return

    const existingApplied = findAppliedProjectId(projects, fingerprint, workspaceId)
    if (existingApplied) {
      onPlanApplied(existingApplied)
      return
    }

    let hasLiveWorkItems = true
    try {
      const listed = await pmApi.listWorkItems({
        workspaceId,
        projectId: selectedProjectId,
        limit: 1,
      })
      hasLiveWorkItems = listed.items.length > 0
    } catch {
      hasLiveWorkItems = true
    }

    const action = resolvePmPlanApplyAction({
      fingerprint,
      fingerprintAlreadyApplied: false,
      hasLiveWorkItems,
      hasAnyPriorReceipt: readAppliedPlanReceipts(selectedProject.metadata).length > 0,
    })
    if (hasLiveWorkItems || action === 'reapply') {
      if (
        !confirmDestructiveApply(
          action === 'reapply' ? 'reapply' : 'confirm',
          selectedProject.name,
        )
      ) {
        return
      }
    }

    applyingRef.current = true
    setApplying(true)
    try {
      await protectCurrentVersionBaseline(selectedProject)
      await pmApi.applyScheduleSuggestions({
        workspaceId,
        projectId: selectedProjectId,
        suggestions: scheduleSuggestions,
      })
      await markApplied(selectedProjectId)
      await markPendingRevision(selectedProjectId)
      onPlanApplied(selectedProjectId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      applyingRef.current = false
      setApplying(false)
    }
  }, [
    confirmDestructiveApply,
    fingerprint,
    lastAssistant,
    markApplied,
    markPendingRevision,
    onPlanApplied,
    projects,
    protectCurrentVersionBaseline,
    scheduleSuggestions,
    selectedProject,
    selectedProjectId,
    t,
    workspaceId,
  ])

  if (!lastAssistant || !hasSuggestion) {
    return null
  }

  if (appliedProjectId) {
    return (
      <button
        type="button"
        className="tm-pm-agent-apply-text-btn"
        title={t('projectManagerPage.agent.applyGoToGantt')}
        onClick={() => onPlanApplied(appliedProjectId)}>
        {t('projectManagerPage.agent.applyGoToGantt')}
      </button>
    )
  }

  const buttonLabel =
    applyAction === 'reapply'
      ? t('projectManagerPage.agent.applyReapply')
      : t('projectManagerPage.agent.applyConfirm')

  return (
    <button
      type="button"
      className="tm-pm-agent-apply-text-btn"
      title={
        canApplyPlan
          ? t('projectManagerPage.agent.applyPlan', { count: wbsSuggestions.length })
          : t('projectManagerPage.agent.applySchedule', { count: scheduleSuggestions.length })
      }
      disabled={applying || (canApplyScheduleOnly && !selectedProjectId)}
      onClick={() => void (canApplyPlan ? handleApplyPlan() : handleApplySchedule())}>
      {applying ? '…' : buttonLabel}
    </button>
  )
}
