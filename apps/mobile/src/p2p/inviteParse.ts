import {
  resolveInvitePreview,
  type ParsedToolmanInviteUrl,
  type PeekedInviteTokenFields,
} from '@toolman/shared'

export type PendingP2pInvite = {
  raw: string
  token: string
  bundled?: string
  workspaceId?: string
  workspaceName?: string
  ownerIdentityId?: string
  ownerDeviceId?: string
  ownerDisplayName?: string
  role?: string
  expiresAt?: number
  hubUrls?: string[]
  receivedAt: number
}

export function pendingInviteFromInput(input: string): PendingP2pInvite | null {
  let parsed: ParsedToolmanInviteUrl
  let peeked: PeekedInviteTokenFields | null
  let workspaceId: string | undefined
  let workspaceName: string | undefined
  let hubUrls: string[] | undefined
  try {
    const preview = resolveInvitePreview(input)
    parsed = preview.parsed
    peeked = preview.peeked
    workspaceId = preview.workspaceId
    workspaceName = preview.workspaceName
    hubUrls = preview.hubUrls.length > 0 ? preview.hubUrls : undefined
  } catch {
    return null
  }
  return {
    raw: parsed.raw,
    token: parsed.token || parsed.bundled || parsed.raw,
    bundled: parsed.bundled,
    workspaceId,
    workspaceName,
    hubUrls,
    ownerIdentityId: peeked?.ownerIdentityId,
    ownerDeviceId: peeked?.ownerDeviceId,
    ownerDisplayName: peeked?.ownerDisplayName,
    role: peeked?.role,
    expiresAt: peeked?.expiresAt,
    receivedAt: Date.now(),
  }
}
