import type { ReactNode } from 'react'
import type { Message, PmAgentApplyKind, PmProject } from '@toolman/shared'
import { ProjectCostCatalogApplyBar } from './ProjectCostCatalogApplyBar'
import { ProjectCostPlanApplyBar } from './ProjectCostPlanApplyBar'
import { ProjectPlanAgentApplyBar } from './ProjectPlanAgentApplyBar'
import { ProjectResourceCatalogApplyBar } from './ProjectResourceCatalogApplyBar'
import { ProjectResourcePlanApplyBar } from './ProjectResourcePlanApplyBar'

export function ProjectManagementAgentPanelApply({
  workspaceId,
  messages,
  projects,
  selectedProjectId,
  applyKinds,
  onPlanApplied,
  onProjectsChange,
}: {
  workspaceId: string
  messages: Message[]
  projects: PmProject[]
  selectedProjectId: string | null
  applyKinds: PmAgentApplyKind[]
  onPlanApplied?: (projectId: string) => void
  onProjectsChange?: () => void | Promise<void>
}): ReactNode {
  if (applyKinds.length === 0) return null
  return (
    <>
      {applyKinds.includes('plan') || applyKinds.includes('schedule') ? (
        <ProjectPlanAgentApplyBar
          workspaceId={workspaceId}
          messages={messages}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onPlanApplied={(projectId) => onPlanApplied?.(projectId)}
          onProjectsChange={onProjectsChange}
        />
      ) : null}
      {applyKinds.includes('resourcePlan') ? (
        <ProjectResourcePlanApplyBar
          workspaceId={workspaceId}
          messages={messages}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onPlanApplied={(projectId) => onPlanApplied?.(projectId)}
          onProjectsChange={onProjectsChange}
        />
      ) : null}
      {applyKinds.includes('resourceCatalog') ? (
        <ProjectResourceCatalogApplyBar
          workspaceId={workspaceId}
          messages={messages}
          onProjectsChange={onProjectsChange}
        />
      ) : null}
      {applyKinds.includes('costPlan') ? (
        <ProjectCostPlanApplyBar
          workspaceId={workspaceId}
          messages={messages}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onPlanApplied={(projectId) => onPlanApplied?.(projectId)}
          onProjectsChange={onProjectsChange}
        />
      ) : null}
      {applyKinds.includes('costCatalog') ? (
        <ProjectCostCatalogApplyBar
          workspaceId={workspaceId}
          messages={messages}
          onProjectsChange={onProjectsChange}
        />
      ) : null}
    </>
  )
}
