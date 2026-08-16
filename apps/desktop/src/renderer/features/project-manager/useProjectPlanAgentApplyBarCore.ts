import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  parsePmFullPlanFromText,
  parsePmScheduleSuggestionsFromText,
  readAppliedPlanReceipts,
  resolvePmPlanApplyAction,
  type Message,
  type PmProject,
} from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { getMessageText } from '../chat/message-utils'
import {
  isPmAgentApplyDiscarded,
  markPmAgentApplyDiscarded,
} from './pm-agent-apply-discard'
import {
  buildPmPlanFingerprint,
  findAppliedProjectId,
} from './pm-plan-agent-apply-storage'
import { useProjectPlanAgentApplyActions } from './useProjectPlanAgentApplyActions'

export interface ProjectPlanAgentApplyBarProps {
  workspaceId: string
  messages: Message[]
  projects: PmProject[]
  selectedProjectId: string | null
  onPlanApplied: (projectId: string) => void
  /** Refresh project list after metadata / apply changes. */
  onProjectsChange?: () => void | Promise<void>
}

export function useProjectPlanAgentApplyBar({
  workspaceId,
  messages,
  projects,
  selectedProjectId,
  onPlanApplied,
  onProjectsChange,
}: ProjectPlanAgentApplyBarProps) {
  const { t } = useI18n()
  /** Local override so UI flips to 跳转 immediately even if parent remounts mid-navigate. */
  const [localAppliedProjectId, setLocalAppliedProjectId] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)

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
    return buildPmPlanFingerprint(wbsSuggestions, parsedPlan.projectPlan)
  }, [canApplyPlan, parsedPlan.projectPlan, scheduleSuggestions, wbsSuggestions])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  // Keep local apply state in sync with durable receipts (+ session optimistic cache).
  useEffect(() => {
    if (!workspaceId || !fingerprint) {
      setLocalAppliedProjectId(null)
      setDiscarded(false)
      return
    }
    const stored = findAppliedProjectId(projects, fingerprint, workspaceId)
    setLocalAppliedProjectId(stored)
    setDiscarded(isPmAgentApplyDiscarded(workspaceId, 'plan', fingerprint))
  }, [fingerprint, projects, workspaceId])

  const handleDiscard = useCallback(() => {
    if (!fingerprint) return
    markPmAgentApplyDiscarded(workspaceId, 'plan', fingerprint)
    setDiscarded(true)
  }, [fingerprint, workspaceId])

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

  const { applying, handleApplyPlan, handleApplySchedule } = useProjectPlanAgentApplyActions({
    workspaceId,
    projects,
    selectedProject,
    selectedProjectId,
    fingerprint,
    canApplyPlan,
    lastAssistant,
    wbsSuggestions,
    scheduleSuggestions,
    projectPlan: parsedPlan.projectPlan,
    onPlanApplied,
    onProjectsChange,
    onLocalApplied: setLocalAppliedProjectId,
  })

  return {
    t,
    applying,
    discarded,
    lastAssistant,
    hasSuggestion,
    canApplyPlan,
    canApplyScheduleOnly,
    selectedProjectId,
    wbsSuggestions,
    scheduleSuggestions,
    appliedProjectId,
    applyAction,
    handleDiscard,
    handleApplyPlan,
    handleApplySchedule,
  }
}
