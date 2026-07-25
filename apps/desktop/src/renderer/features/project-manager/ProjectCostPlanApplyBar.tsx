import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildPmCostPlanFingerprint,
  hasAppliedCostPlanFingerprint,
  parsePmCostPlanFromText,
  upsertAppliedCostPlanReceipt,
  type Message,
  type PmCostTaskPlanSuggestion,
  type PmProject,
} from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { getMessageText } from '../chat/message-utils'
import { pmApi } from './pm-api'
import {
  isPmAgentApplyDiscarded,
  markPmAgentApplyDiscarded,
} from './pm-agent-apply-discard'
import {
  markSessionPendingAgentRevision,
  pendingAgentRevisionMetadataPatch,
} from './pm-pending-revision'
import {
  readSharedCostCatalog,
  toSharedCostCatalogType,
  upsertSharedCostCatalog,
  writeSharedCostCatalog,
  type PmCostRow,
  type PmCostType,
} from './views/cost/pm-cost-catalog'

function storageKey(workspaceId: string): string {
  return `tm-pm-cost-plan-applied:${workspaceId}`
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

function assignmentCount(suggestions: readonly PmCostTaskPlanSuggestion[]): number {
  return suggestions.reduce((sum, task) => sum + task.assignments.length, 0)
}

/** Durable receipts in project metadata first; session map as optimistic fallback. */
function findAppliedProjectId(
  projects: PmProject[],
  fingerprint: string,
  workspaceId: string,
): string | null {
  if (!fingerprint) return null
  for (const project of projects) {
    if (hasAppliedCostPlanFingerprint(project.metadata, fingerprint)) {
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
  onPlanApplied: (projectId: string) => void
  onProjectsChange?: () => void | Promise<void>
}

/** Confirm costPlan JSON from the cost-management session into Gantt columns. */
export function ProjectCostPlanApplyBar({
  workspaceId,
  messages,
  projects,
  selectedProjectId,
  onPlanApplied,
  onProjectsChange,
}: Props) {
  const { t } = useI18n()
  const [applying, setApplying] = useState(false)
  const [localAppliedProjectId, setLocalAppliedProjectId] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)
  const applyingRef = useRef(false)

  const lastAssistant = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message?.role === 'assistant') return message
    }
    return null
  }, [messages])

  const lastAssistantText = lastAssistant ? getMessageText(lastAssistant) : ''
  const costPlan = useMemo(
    () => parsePmCostPlanFromText(lastAssistantText).costPlan,
    [lastAssistantText],
  )
  const hasSuggestion = costPlan.length > 0
  const fingerprint = useMemo(
    () => (hasSuggestion ? buildPmCostPlanFingerprint(costPlan) : ''),
    [costPlan, hasSuggestion],
  )

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  useEffect(() => {
    if (!workspaceId || !fingerprint) {
      setLocalAppliedProjectId(null)
      setDiscarded(false)
      return
    }
    setLocalAppliedProjectId(findAppliedProjectId(projects, fingerprint, workspaceId))
    setDiscarded(isPmAgentApplyDiscarded(workspaceId, 'costPlan', fingerprint))
  }, [fingerprint, projects, workspaceId])

  const handleDiscard = useCallback(() => {
    if (!fingerprint) return
    markPmAgentApplyDiscarded(workspaceId, 'costPlan', fingerprint)
    setDiscarded(true)
  }, [fingerprint, workspaceId])

  const appliedProjectId = (() => {
    const id =
      localAppliedProjectId ?? findAppliedProjectId(projects, fingerprint, workspaceId)
    if (!id) return null
    if (!projects.some((project) => project.id === id)) return null
    return id
  })()

  const syncLocalCatalog = useCallback(
    async (
      upserts: Array<{
        type: string
        name: string
        unit?: string
        quantity?: number | null
        unitPrice?: number | null
      }>,
    ) => {
      if (upserts.length === 0) return
      const shared = readSharedCostCatalog(workspaceId)
      const incoming: PmCostRow[] = upserts.map((entry, index) => ({
        id: crypto.randomUUID(),
        type: (entry.type as PmCostType) || 'other',
        code: '',
        name: entry.name,
        featureDescription: '',
        unit: entry.unit ?? '',
        quantity: entry.quantity ?? null,
        unitPrice: entry.unitPrice ?? null,
        applicable: 'all',
        note: '',
        sectionalWork: '',
        sectionCode: '',
        sectionNote: '',
        sortOrder: shared.rows.length + index,
        parentId: null,
      }))
      const merged = upsertSharedCostCatalog(shared.rows, incoming)
      if (merged.changed) {
        writeSharedCostCatalog(workspaceId, merged.rows)
      }
      try {
        await pmApi.upsertSharedCostCatalog(
          workspaceId,
          upserts.map((entry) => ({
            type: toSharedCostCatalogType((entry.type as PmCostType) || 'other'),
            name: entry.name,
            unit: entry.unit,
            quantity: entry.quantity,
            unitPrice: entry.unitPrice,
          })),
        )
      } catch {
        // Durable upsert already ran in main apply; local mirror is best-effort.
      }
    },
    [workspaceId],
  )

  const markApplied = useCallback(
    async (projectId: string) => {
      setLocalAppliedProjectId(projectId)
      const map = readAppliedMap(workspaceId)
      map[fingerprint] = projectId
      writeAppliedMap(workspaceId, map)
      markSessionPendingAgentRevision(workspaceId, projectId)
      try {
        const fresh = await pmApi.getProject(projectId)
        await pmApi.updateProject({
          id: projectId,
          metadata: {
            // Durable receipt so the 跳转 state survives app restart.
            ...upsertAppliedCostPlanReceipt(fresh.metadata, fingerprint),
            ...pendingAgentRevisionMetadataPatch(),
          },
        })
        await onProjectsChange?.()
      } catch {
        // Session map still prevents immediate double-apply.
      }
    },
    [fingerprint, onProjectsChange, workspaceId],
  )

  const handleApply = useCallback(async () => {
    if (!hasSuggestion || !lastAssistant || applyingRef.current) return
    if (appliedProjectId) {
      onPlanApplied(appliedProjectId)
      return
    }
    if (!selectedProjectId || !selectedProject) {
      window.alert(t('projectManagerPage.agent.applyNeedProject'))
      return
    }

    applyingRef.current = true
    setApplying(true)
    try {
      const listed = await pmApi.listWorkItems({
        workspaceId,
        projectId: selectedProjectId,
        limit: 1,
      })
      if (listed.items.length === 0) {
        window.alert(t('projectManagerPage.agent.applyNeedProgress'))
        return
      }

      const result = await pmApi.applyCostPlanSuggestions({
        workspaceId,
        projectId: selectedProjectId,
        suggestions: costPlan,
      })
      await syncLocalCatalog(result.catalogUpserts)
      await markApplied(selectedProjectId)
      onPlanApplied(selectedProjectId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      applyingRef.current = false
      setApplying(false)
    }
  }, [
    appliedProjectId,
    costPlan,
    hasSuggestion,
    lastAssistant,
    markApplied,
    onPlanApplied,
    selectedProject,
    selectedProjectId,
    syncLocalCatalog,
    t,
    workspaceId,
  ])

  if (!lastAssistant || !hasSuggestion) return null

  if (discarded) return null

  if (appliedProjectId) {
    return (
      <span className="tm-pm-agent-apply-actions">
        <button
          type="button"
          className="tm-pm-agent-apply-text-btn"
          title={t('projectManagerPage.agent.applyGoToGantt')}
          onClick={() => onPlanApplied(appliedProjectId)}
        >
          {t('projectManagerPage.agent.applyGoToGantt')}
        </button>
      </span>
    )
  }

  const count = assignmentCount(costPlan)
  const isReapply = Boolean(readAppliedMap(workspaceId)[fingerprint])
  const buttonLabel = isReapply
    ? t('projectManagerPage.agent.applyReapply')
    : t('projectManagerPage.agent.applyConfirm')

  return (
    <span className="tm-pm-agent-apply-actions">
      <button
        type="button"
        className="tm-pm-agent-apply-text-btn"
        title={t('projectManagerPage.agent.applyCostPlan', { count })}
        disabled={applying}
        onClick={() => void handleApply()}
      >
        {applying ? '…' : buttonLabel}
      </button>
      <button
        type="button"
        className="tm-pm-agent-apply-text-btn tm-pm-agent-apply-text-btn--muted"
        title={t('projectManagerPage.agent.applyDiscard')}
        disabled={applying}
        onClick={handleDiscard}
      >
        {t('projectManagerPage.agent.applyDiscard')}
      </button>
    </span>
  )
}
