import {
  PmDocumentLinkCreateInputSchema,
  PmDocumentLinkDeleteInputSchema,
  PmDocumentLinkListInputSchema,
} from '@toolman/shared'
import { PmDocumentLinkRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'

function getRepo(): PmDocumentLinkRepository {
  return new PmDocumentLinkRepository(getDatabase())
}

export function listPmDocumentLinks(input: unknown) {
  const data = PmDocumentLinkListInputSchema.parse(input)
  const links = getRepo().list({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    workItemId: data.workItemId,
    limit: data.limit,
  })
  return { links }
}

export function createPmDocumentLink(input: unknown) {
  const data = PmDocumentLinkCreateInputSchema.parse(input)
  const link = getRepo().create({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    workItemId: data.workItemId,
    knowledgeBaseId: data.knowledgeBaseId,
    knowledgeDocumentId: data.knowledgeDocumentId,
    linkType: data.linkType,
    titleOverride: data.titleOverride,
    metadata: data.metadata,
  })
  return link
}

export function deletePmDocumentLink(input: unknown) {
  const data = PmDocumentLinkDeleteInputSchema.parse(input)
  const existing = getRepo().getById(data.id)
  const deleted = getRepo().softDelete(data.id)
  if (!deleted || !existing) {
    throw new Error('文档关联不存在')
  }
  return { ok: true as const }
}
