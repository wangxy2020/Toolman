export function serializeWorkflowShareMetadata(input: {
  sourceWorkspaceId?: string
  workflowJson: string
  engine?: string
  graphPath?: string
}): string {
  return JSON.stringify({
    ...(input.sourceWorkspaceId ? { sourceWorkspaceId: input.sourceWorkspaceId } : {}),
    workflowJson: input.workflowJson,
    ...(input.engine ? { engine: input.engine } : {}),
    ...(input.graphPath ? { graphPath: input.graphPath } : {}),
  })
}

export function readWorkflowShareMetadata(metadataJson: string | null | undefined): {
  sourceWorkspaceId?: string
  workflowJson?: string
  engine?: string
  graphPath?: string
} {
  if (!metadataJson) return {}
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>
    return {
      sourceWorkspaceId:
        typeof parsed.sourceWorkspaceId === 'string' ? parsed.sourceWorkspaceId : undefined,
      workflowJson:
        typeof parsed.workflowJson === 'string' ? parsed.workflowJson : undefined,
      engine: typeof parsed.engine === 'string' ? parsed.engine : undefined,
      graphPath: typeof parsed.graphPath === 'string' ? parsed.graphPath : undefined,
    }
  } catch {
    return {}
  }
}
