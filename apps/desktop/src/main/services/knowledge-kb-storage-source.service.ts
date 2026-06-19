import {
  KnowledgeWatchConfigSchema,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
} from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'

function parseWatchConfig(json: string) {
  try {
    return KnowledgeWatchConfigSchema.parse(JSON.parse(json))
  } catch {
    return DEFAULT_KNOWLEDGE_WATCH_CONFIG
  }
}

export function ensureKnowledgeBaseStorageSource(
  workspaceId: string,
  kbId: string,
  storagePath: string,
) {
  const docRepo = getDocumentRepository()
  let source = docRepo.findSourceByUri(kbId, storagePath)
  if (!source) {
    source = docRepo.createSource({
      kbId,
      type: 'folder',
      uri: storagePath,
    })
  }

  const kbRepo = getKnowledgeBaseRepository()
  const kb = kbRepo.findRowById(kbId, workspaceId)
  if (kb) {
    const currentWatch = parseWatchConfig(kb.watchConfigJson)
    kbRepo.update({
      id: kbId,
      workspaceId,
      watchConfigJson: JSON.stringify({
        ...currentWatch,
        paths: [storagePath],
      }),
    })
  }

  return source
}
