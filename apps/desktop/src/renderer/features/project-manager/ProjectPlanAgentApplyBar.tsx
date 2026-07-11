import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  parsePmFullPlanFromText,
  parsePmScheduleSuggestionsFromText,
  type Message,
  type PmProject,
  type PmProjectPlan,
  type PmWbsSuggestion,
} from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { getMessageText } from '../chat/message-utils'
import { pmApi } from './pm-api'
import type { PmNewProjectBriefValues } from './PmNewProjectBriefForm'

export type PmPendingNewProjectBrief = PmNewProjectBriefValues

function storageKey(workspaceId: string): string {
  return `tm-pm-plan-applied:${workspaceId}`
}

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

interface Props {
  workspaceId: string
  messages: Message[]
  projects: PmProject[]
  selectedProjectId: string | null
  pendingBrief: PmPendingNewProjectBrief | null
  onPlanApplied: (projectId: string) => void
  onBriefConsumed?: () => void
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

  // Keep local apply state in sync with the current plan fingerprint so a newer
  // assistant plan can be applied again (instead of only jumping to the old id).
  useEffect(() => {
    if (!workspaceId || !fingerprint) {
      setLocalAppliedProjectId(null)
      return
    }
    const stored = readAppliedMap(workspaceId)[fingerprint] ?? null
    const stillExists =
      stored != null && projects.some((project) => project.id === stored)
    if (stored && !stillExists) {
      clearPmPlanAppliedProject(workspaceId, stored)
      setLocalAppliedProjectId(null)
      return
    }
    setLocalAppliedProjectId(stored)
  }, [fingerprint, projects, workspaceId])

  const storedAppliedProjectId = useMemo(() => {
    if (!workspaceId || !fingerprint) return null
    return readAppliedMap(workspaceId)[fingerprint] ?? null
  }, [fingerprint, workspaceId, localAppliedProjectId])

  const appliedProjectId = (() => {
    const id = localAppliedProjectId ?? storedAppliedProjectId
    if (!id) return null
    if (!projects.some((project) => project.id === id)) return null
    return id
  })()

  const markApplied = useCallback(
    (projectId: string) => {
      setLocalAppliedProjectId(projectId)
      const map = readAppliedMap(workspaceId)
      map[fingerprint] = projectId
      writeAppliedMap(workspaceId, map)
    },
    [fingerprint, workspaceId],
  )

  const handleApplyPlan = useCallback(async () => {
    if (!canApplyPlan || !lastAssistant || applyingRef.current) return

    const existingApplied = readAppliedMap(workspaceId)[fingerprint]
    if (existingApplied && projects.some((project) => project.id === existingApplied)) {
      onPlanApplied(existingApplied)
      return
    }
    if (existingApplied) {
      clearPmPlanAppliedProject(workspaceId, existingApplied)
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
        markApplied(result.projectId)
        onBriefConsumed?.()
        onPlanApplied(result.projectId)
        return
      }

      if (!selectedProjectId) {
        window.alert(t('projectManagerPage.agent.applyNeedProject'))
        return
      }

      const selectedProject = projects.find((project) => project.id === selectedProjectId)
      if (!selectedProject) {
        window.alert(t('projectManagerPage.agent.applyNeedProject'))
        return
      }
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
      markApplied(result.projectId)
      onPlanApplied(result.projectId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      applyingRef.current = false
      setApplying(false)
    }
  }, [
    canApplyPlan,
    fingerprint,
    lastAssistant,
    markApplied,
    onBriefConsumed,
    onPlanApplied,
    parsedPlan.projectPlan,
    pendingBrief,
    projects,
    scheduleSuggestions,
    selectedProjectId,
    t,
    wbsSuggestions,
    workspaceId,
  ])

  const handleApplySchedule = useCallback(async () => {
    if (!selectedProjectId || !lastAssistant || scheduleSuggestions.length === 0) return
    if (applyingRef.current) return

    const existingApplied = readAppliedMap(workspaceId)[fingerprint]
    if (existingApplied && projects.some((project) => project.id === existingApplied)) {
      onPlanApplied(existingApplied)
      return
    }
    if (existingApplied) {
      clearPmPlanAppliedProject(workspaceId, existingApplied)
    }

    applyingRef.current = true
    setApplying(true)
    try {
      await pmApi.applyScheduleSuggestions({
        workspaceId,
        projectId: selectedProjectId,
        suggestions: scheduleSuggestions,
      })
      markApplied(selectedProjectId)
      onPlanApplied(selectedProjectId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      applyingRef.current = false
      setApplying(false)
    }
  }, [
    fingerprint,
    lastAssistant,
    markApplied,
    onPlanApplied,
    projects,
    scheduleSuggestions,
    selectedProjectId,
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
      {applying ? '…' : t('projectManagerPage.agent.applyConfirm')}
    </button>
  )
}
