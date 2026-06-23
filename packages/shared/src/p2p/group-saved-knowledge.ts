export interface P2pGroupSavedKnowledgeMeta {
  groupName: string
  /** @deprecated Kept for legacy metadata; no longer used for display or storage layout. */
  sharedFolderName?: string
  p2pWorkspaceId?: string
}

export interface GroupSavedKnowledgeBaseCandidate {
  id: string
  kind: string
  name: string
  description: string | null
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
  _sharedFolderName?: string,
  p2pWorkspaceId?: string,
): P2pGroupSavedKnowledgeMeta {
  return {
    groupName: sanitizeP2pGroupSavedFolderSegment(groupName, '群组'),
    ...(p2pWorkspaceId ? { p2pWorkspaceId } : {}),
  }
}

export function buildP2pGroupSavedKnowledgeDisplayName(groupName: string): string {
  return sanitizeP2pGroupSavedFolderSegment(groupName, '群组')
}

export function resolveGroupSavedKnowledgeSidebarLabel(kb: {
  name: string
  description?: string | null
}): string {
  const meta = parseP2pGroupSavedKnowledgeMeta(kb.description)
  if (meta) return meta.groupName

  const bracketMatch = kb.name.trim().match(/^\[([^\]]+)\]/)
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim()
  }

  return kb.name.trim()
}

export function findGroupSavedKnowledgeBaseId(
  knowledgeBases: GroupSavedKnowledgeBaseCandidate[],
  input: {
    p2pWorkspaceId?: string
    groupName: string
    sharedFolderName?: string
  },
  options?: {
    isMirrorDescription?: (description: string | null | undefined) => boolean
  },
): string | null {
  const isMirror = options?.isMirrorDescription ?? (() => false)
  const savedMeta = normalizeP2pGroupSavedKnowledgeMeta(
    input.groupName,
    input.sharedFolderName,
    input.p2pWorkspaceId,
  )
  const displayName = buildP2pGroupSavedKnowledgeDisplayName(savedMeta.groupName)

  const sharedBases = knowledgeBases.filter(
    (item) => item.kind === 'shared' && !isMirror(item.description),
  )

  if (input.p2pWorkspaceId) {
    const byWorkspace = sharedBases.find((item) => {
      const meta = parseP2pGroupSavedKnowledgeMeta(item.description)
      return meta != null && meta.p2pWorkspaceId === input.p2pWorkspaceId
    })
    if (byWorkspace) return byWorkspace.id
  }

  const byMeta = sharedBases.find((item) => {
    const meta = parseP2pGroupSavedKnowledgeMeta(item.description)
    return meta != null && meta.groupName === savedMeta.groupName
  })
  if (byMeta) return byMeta.id

  const legacy = sharedBases.find((item) => {
    if (parseP2pGroupSavedKnowledgeMeta(item.description)) return false
    return (
      item.name === savedMeta.groupName ||
      item.name === displayName ||
      item.name.startsWith(`[${savedMeta.groupName}]`)
    )
  })
  return legacy?.id ?? null
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
    if (meta && typeof meta.groupName === 'string' && meta.groupName.trim().length > 0) {
      return {
        groupName: meta.groupName.trim(),
        ...(typeof meta.sharedFolderName === 'string' && meta.sharedFolderName.trim()
          ? { sharedFolderName: meta.sharedFolderName.trim() }
          : {}),
        ...(typeof meta.p2pWorkspaceId === 'string' && meta.p2pWorkspaceId.trim()
          ? { p2pWorkspaceId: meta.p2pWorkspaceId.trim() }
          : {}),
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
