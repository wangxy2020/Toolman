import { wouldCreatePmWorkItemCycle } from '@toolman/shared'
import { PmWorkItemRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'

function getWorkItemRepo(): PmWorkItemRepository {
  return new PmWorkItemRepository(getDatabase())
}

export function assertValidPmWorkItemParent(options: {
  workspaceId: string
  projectId: string
  workItemId?: string
  parentId?: string | null
}): void {
  if (!options.parentId) {
    return
  }

  if (options.workItemId && options.parentId === options.workItemId) {
    throw new Error('不能将工作项设为自己的父项')
  }

  const repo = getWorkItemRepo()
  const parent = repo.getById(options.parentId)
  if (!parent) {
    throw new Error('父工作项不存在')
  }
  if (parent.workspaceId !== options.workspaceId) {
    throw new Error('父工作项与工作区不匹配')
  }
  if (parent.projectId !== options.projectId) {
    throw new Error('父工作项须属于同一项目')
  }

  if (!options.workItemId) {
    return
  }

  const siblings = repo.list({
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    limit: 1000,
  })
  if (wouldCreatePmWorkItemCycle(siblings, options.workItemId, options.parentId)) {
    throw new Error('不能形成循环层级')
  }
}
