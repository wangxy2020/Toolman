import { P2pMemberRepository, P2pSharedResourceRepository, P2pWorkspaceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'

export function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

export function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

export function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}
