import { P2pSharedResourceRepository } from '@toolman/db'
import { P2pResourceUnshareInputSchema } from '@toolman/shared'
import { getDatabase } from '../../../bootstrap/database'
import { appendP2pEvent } from '../p2p-event.service'
import { assertCanManageSharedResource } from '../p2p-permission.guard'
import { readAgentShareMetadata, serializeAgentShareMetadata } from './metadata'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

export async function unshareP2pAgent(rawInput: unknown): Promise<{ unshared: true }> {
  const input = P2pResourceUnshareInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Agent') {
    throw new Error('只能取消共享智能体资源')
  }

  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)
  const metadata = readAgentShareMetadata(resource.metadataJson)
  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId: metadata.sourceWorkspaceId,
    packageJson: metadata.packageJson,
  })
  sharedRepo.update({ id: resource.id, status: 'unshared', metadataJson })

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Agent',
    resourceId: resource.localResourceId ?? resource.id,
    operatorId: member.id,
    eventType: 'Deleted',
    payload: {
      assistant_id: resource.localResourceId ?? resource.id,
    },
  })

  return { unshared: true }
}
