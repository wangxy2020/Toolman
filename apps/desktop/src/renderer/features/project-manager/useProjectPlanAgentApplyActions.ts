import { useCallback, useRef, useState } from 'react'

import {
  readAppliedPlanReceipts,
  readScheduleVersion,
  resolvePmPlanApplyAction,
  upsertAppliedPlanReceipt,
  versionPlanSnapshotName,
  type Message,
  type PmProject,
  type PmProjectPlan,
  type PmScheduleSuggestion,
  type PmWbsSuggestion,
} from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { pmApi } from './pm-api'
import {
  findAppliedProjectId,
  rememberAppliedFingerprint,
} from './pm-plan-agent-apply-storage'
import {
  markSessionPendingAgentRevision,
  pendingAgentRevisionMetadataPatch,
} from './pm-pending-revision'
import { pmScheduleApi } from './views/schedule/pm-schedule-api'

type ApplyActionsArgs = {
  workspaceId: string
  projects: PmProject[]
  selectedProject: PmProject | null
  selectedProjectId: string | null
  fingerprint: string
  canApplyPlan: boolean
  lastAssistant: Message | null
  wbsSuggestions: PmWbsSuggestion[]
  scheduleSuggestions: PmScheduleSuggestion[]
  projectPlan: PmProjectPlan | undefined
  onPlanApplied: (projectId: string) => void
  onProjectsChange?: () => void | Promise<void>
  onLocalApplied: (projectId: string) => void
}

export function useProjectPlanAgentApplyActions({
  workspaceId,
  projects,
  selectedProject,
  selectedProjectId,
  fingerprint,
  canApplyPlan,
  lastAssistant,
  wbsSuggestions,
  scheduleSuggestions,
  projectPlan,
  onPlanApplied,
  onProjectsChange,
  onLocalApplied,
}: ApplyActionsArgs) {
  const { t } = useI18n()
  const [applying, setApplying] = useState(false)
  const applyingRef = useRef(false)

  const markApplied = useCallback(
    async (projectId: string) => {
      onLocalApplied(projectId)
      rememberAppliedFingerprint(workspaceId, fingerprint, projectId)
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
    [fingerprint, onLocalApplied, onProjectsChange, workspaceId],
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
        projectPlan,
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
    onPlanApplied,
    projectPlan,
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
    workspaceId,
  ])

  return {
    applying,
    handleApplyPlan,
    handleApplySchedule,
  }
}
