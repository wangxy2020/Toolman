import {
  hasCommunityAgentPackage,
  importCommunityAgentPackage,
  type CommunityAgentPackageImportResult,
} from './adapters/agent-package.adapter'
import {
  hasCommunityKnowledgeBundle,
  importCommunityKnowledgeBundle,
  type CommunityKnowledgeBundleImportResult,
} from './adapters/knowledge-bundle.adapter'

export interface CommunityBundleApplyResult {
  agentPackage?: CommunityAgentPackageImportResult
  knowledgeBundle?: CommunityKnowledgeBundleImportResult
}

export function hasCommunityPackageBundles(packagePath: string): boolean {
  return hasCommunityAgentPackage(packagePath) || hasCommunityKnowledgeBundle(packagePath)
}

export async function applyCommunityPackageBundles(
  packagePath: string,
): Promise<CommunityBundleApplyResult> {
  const result: CommunityBundleApplyResult = {}

  if (hasCommunityAgentPackage(packagePath)) {
    result.agentPackage = importCommunityAgentPackage(packagePath)
  }

  if (hasCommunityKnowledgeBundle(packagePath)) {
    result.knowledgeBundle = await importCommunityKnowledgeBundle(packagePath)
  }

  return result
}

export function resolveBundleAwareLocalRef(
  primaryLocalRef: string | null,
  bundles: CommunityBundleApplyResult,
): string {
  if (primaryLocalRef) return primaryLocalRef
  if (bundles.agentPackage) return bundles.agentPackage.assistantId
  if (bundles.knowledgeBundle) return bundles.knowledgeBundle.kbId
  throw new Error('Community install produced no local reference')
}
