export async function exportCommunityKnowledgeBundle(input: unknown) {
  const { exportCommunityKnowledgeBundle: exportBundle } = await import(
    './community-knowledge-bundle-export.service'
  )
  return exportBundle(input)
}

export async function exportCommunityMcpPackage(input: unknown) {
  const { exportCommunityMcpPackage: exportPackage } = await import(
    './community-mcp-package-export.service'
  )
  return exportPackage(input)
}

export async function prepareCommunityMcpPackage(input: unknown) {
  const { prepareCommunityMcpPackage: preparePackage } = await import(
    './community-mcp-package-import.service'
  )
  return preparePackage(input)
}

export async function prepareCommunitySkillPackage(input: unknown) {
  const { prepareCommunitySkillPackage: preparePackage } = await import(
    './community-skill-package-import.service'
  )
  return preparePackage(input)
}

export async function prepareCommunityWorkflowPackage(input: unknown) {
  const { prepareCommunityWorkflowPackage: preparePackage } = await import(
    './community-workflow-package-import.service'
  )
  return preparePackage(input)
}

export async function prepareCommunityKnowledgePackage(input: unknown) {
  const { prepareCommunityKnowledgePackage: preparePackage } = await import(
    './community-knowledge-package-import.service'
  )
  return preparePackage(input)
}
