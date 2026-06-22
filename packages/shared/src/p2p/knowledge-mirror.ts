import { sha256Hex } from '../utils/sha256-hex.js'

export interface P2pSharedKnowledgeMirrorMeta {
  p2pWorkspaceId: string
  sourceKbId: string
}

export function buildP2pSharedKnowledgeMirrorKbId(
  p2pWorkspaceId: string,
  sourceKbId: string,
): string {
  const hash = sha256Hex(`toolman:p2p-shared-kb:${p2pWorkspaceId}:${sourceKbId}`)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export function buildP2pSharedKnowledgeMirrorDescription(
  meta: P2pSharedKnowledgeMirrorMeta,
): string {
  return JSON.stringify({ p2pSharedMirror: meta })
}

export function parseP2pSharedKnowledgeMirrorMeta(
  description: string | null | undefined,
): P2pSharedKnowledgeMirrorMeta | null {
  if (!description) return null
  try {
    const parsed = JSON.parse(description) as { p2pSharedMirror?: P2pSharedKnowledgeMirrorMeta }
    const mirror = parsed.p2pSharedMirror
    if (
      mirror &&
      typeof mirror.p2pWorkspaceId === 'string' &&
      typeof mirror.sourceKbId === 'string'
    ) {
      return mirror
    }
  } catch {
    // plain-text description
  }
  return null
}

export function isP2pSharedKnowledgeMirrorDescription(
  description: string | null | undefined,
): boolean {
  return parseP2pSharedKnowledgeMirrorMeta(description) != null
}

export function resolveP2pSharedKnowledgeDocumentKbId(input: {
  p2pWorkspaceId: string
  sourceKbId: string
  isOwnerViewer: boolean
}): string {
  if (input.isOwnerViewer) {
    return input.sourceKbId
  }
  return buildP2pSharedKnowledgeMirrorKbId(input.p2pWorkspaceId, input.sourceKbId)
}
