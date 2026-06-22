export interface P2pGroupSavedKnowledgeMeta {
  groupName: string
  sharedFolderName: string
}

export function sanitizeP2pGroupSavedFolderSegment(name: string, fallback: string): string {
  const sanitized = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized || fallback
}

export function normalizeP2pGroupSavedKnowledgeMeta(
  groupName: string,
  sharedFolderName: string,
): P2pGroupSavedKnowledgeMeta {
  return {
    groupName: sanitizeP2pGroupSavedFolderSegment(groupName, '群组'),
    sharedFolderName: sanitizeP2pGroupSavedFolderSegment(sharedFolderName, '共享文件夹'),
  }
}

export function buildP2pGroupSavedKnowledgeDescription(
  meta: P2pGroupSavedKnowledgeMeta,
): string {
  return JSON.stringify({ groupSavedKnowledge: meta })
}

export function parseP2pGroupSavedKnowledgeMeta(
  description: string | null | undefined,
): P2pGroupSavedKnowledgeMeta | null {
  if (!description) return null
  try {
    const parsed = JSON.parse(description) as {
      groupSavedKnowledge?: P2pGroupSavedKnowledgeMeta
    }
    const meta = parsed.groupSavedKnowledge
    if (
      meta &&
      typeof meta.groupName === 'string' &&
      typeof meta.sharedFolderName === 'string' &&
      meta.groupName.trim().length > 0 &&
      meta.sharedFolderName.trim().length > 0
    ) {
      return {
        groupName: meta.groupName.trim(),
        sharedFolderName: meta.sharedFolderName.trim(),
      }
    }
  } catch {
    // plain-text description
  }
  return null
}

export function isP2pGroupSavedKnowledgeDescription(
  description: string | null | undefined,
): boolean {
  return parseP2pGroupSavedKnowledgeMeta(description) != null
}

export function buildP2pGroupSavedKnowledgeDisplayName(
  groupName: string,
  sharedFolderName: string,
): string {
  return `[${groupName}] ${sharedFolderName}`
}
