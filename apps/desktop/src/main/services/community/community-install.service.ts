import { CommunityInstallInputSchema } from '@toolman/shared'

import { upsertServer } from '../mcp.service'
import { manifestToMcpServerConfig } from './adapters/mcp-market.adapter'
import { installSkillFromMarketPackage } from './adapters/skill-market.adapter'
import { installWorkflowFromMarketPackage } from './adapters/workflow-market.adapter'
import {
  applyCommunityPackageBundles,
  hasCommunityPackageBundles,
  resolveBundleAwareLocalRef,
} from './community-bundle.service'
import { completeInstall, getResource, startInstall } from './community-ipc.facade'

async function reportInstallFailure(installId: string, message: string): Promise<void> {
  try {
    await completeInstall({
      installId,
      status: 'failed',
      errorMessage: message,
    })
  } catch {
    // Ignore secondary hub reporting failures.
  }
}

async function completeCommunityInstall(
  installId: string,
  packagePath: string,
  primaryLocalRef: string | null,
): Promise<void> {
  const bundles = await applyCommunityPackageBundles(packagePath)
  const localRef = resolveBundleAwareLocalRef(primaryLocalRef, bundles)
  await completeInstall({
    installId,
    status: 'success',
    localRef,
  })
}

async function runTypedInstall(
  installId: string,
  packagePath: string,
  errorLabel: string,
  run: () => Promise<string | null>,
): Promise<void> {
  try {
    const primaryLocalRef = await run()
    await completeCommunityInstall(installId, packagePath, primaryLocalRef)
  } catch (error) {
    const message = error instanceof Error ? error.message : errorLabel
    await reportInstallFailure(installId, message)
    throw error
  }
}

export async function installCommunityResource(input: unknown) {
  const parsed = CommunityInstallInputSchema.parse(input)
  const started = await startInstall(input)

  if (parsed.resourceType === 'mcp') {
    await runTypedInstall(started.installId, started.packagePath, 'MCP install failed', async () => {
      let resourceTitle: string | undefined
      try {
        const resource = await getResource({ id: parsed.resourceId })
        resourceTitle = resource.title
      } catch {
        // Title is optional for adapter mapping.
      }

      const serverConfig = manifestToMcpServerConfig({
        manifest: started.manifest,
        packagePath: started.packagePath,
        resourceId: parsed.resourceId,
        resourceTitle,
      })
      return upsertServer(serverConfig).id
    })
    return started
  }

  if (parsed.resourceType === 'skill') {
    await runTypedInstall(started.installId, started.packagePath, 'Skill install failed', async () => {
      const skill = installSkillFromMarketPackage({
        manifest: started.manifest,
        packagePath: started.packagePath,
        resourceId: parsed.resourceId,
      })
      return skill.id
    })
    return started
  }

  if (parsed.resourceType === 'workflow') {
    await runTypedInstall(
      started.installId,
      started.packagePath,
      'Workflow install failed',
      async () => {
        let resourceTitle: string | undefined
        try {
          const resource = await getResource({ id: parsed.resourceId })
          resourceTitle = resource.title
        } catch {
          // Title is optional for adapter mapping.
        }

        const workflow = installWorkflowFromMarketPackage({
          manifest: started.manifest,
          packagePath: started.packagePath,
          resourceId: parsed.resourceId,
          resourceTitle,
        })
        return workflow.id
      },
    )
    return started
  }

  if (hasCommunityPackageBundles(started.packagePath)) {
    await runTypedInstall(started.installId, started.packagePath, 'Bundle install failed', async () => null)
  }

  return started
}
