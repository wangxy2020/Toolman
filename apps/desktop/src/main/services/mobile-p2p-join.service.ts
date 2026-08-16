import { randomUUID } from 'node:crypto'
import {
  P2pJoinInviteAnswerInputSchema,
  P2pJoinInviteAnswerOutputSchema,
  P2pJoinRegisterInputSchema,
  P2pJoinRegisterOutputSchema,
  toErrorMessage,
  type P2pJoinInviteAnswerOutput,
  type P2pJoinRegisterOutput,
  type P2pMember,
} from '@toolman/shared'
import { logStructured } from './structured-log.service'
import { publishP2pGroupSyncChange } from './group-mobile-sync'
import {
  decodeInviteToken,
  parseInviteInput,
  verifyInviteToken,
} from './p2p/p2p-invite.token'
import { getPendingInviteOffer, listInviteIceServers } from './p2p/p2p-invite.service'
import { P2pBridge } from './p2p/p2p-bridge'
import { applyRemoteMemberJoin } from './p2p/p2p-member-join/remote-join'
import { P2pMemberLimitError } from './p2p/p2p-member-join/errors'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import {
  getMemberRepo,
  getWorkspaceRepo,
  listWorkspaceMemberRoster,
  toWorkspaceDto,
} from './p2p/p2p-member-shared'
import { trustPeerSilentlyForWorkspaceMesh } from './p2p/p2p-peer.service'

export async function handleMobileP2pJoinRegister(
  raw: unknown,
): Promise<{ ok: true; data: P2pJoinRegisterOutput } | { ok: false; status: number; error: string }> {
  const parsed = P2pJoinRegisterInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, status: 400, error: '邀请登记参数无效' }
  }

  try {
    const { token } = parseInviteInput(parsed.data.inviteToken)
    const payload = decodeInviteToken(token)
    verifyInviteToken(payload)

    const workspace = getWorkspaceRepo().findById(payload.workspaceId)
    if (!workspace) {
      return { ok: false, status: 404, error: '群组不存在，或本机不是该群群主' }
    }

    const local = getP2pDeviceInfo()
    if (workspace.ownerDeviceId !== local.deviceId) {
      return { ok: false, status: 403, error: '只有群主电脑可以接受邀请登记' }
    }

    const identityId = parsed.data.identityId?.trim() || `mobile:${parsed.data.deviceId}`
    const memberId = randomUUID()
    const member = {
      id: memberId,
      workspaceId: payload.workspaceId,
      identityId,
      deviceId: parsed.data.deviceId,
      displayName: parsed.data.displayName.trim(),
      role: payload.role,
      status: 'invited' as const,
      online: false,
    } as P2pMember

    await applyRemoteMemberJoin(
      {
        workspaceId: payload.workspaceId,
        member,
        inviteId: payload.inviteId,
        peerDeviceId: parsed.data.deviceId,
        deviceKind: parsed.data.deviceKind,
        remoteDevicePublicKey: parsed.data.publicKeyB64,
      },
      { requirePeerTrust: false, forcePendingApproval: true },
    )

    const stored =
      getMemberRepo().findByWorkspaceAndDevice(payload.workspaceId, parsed.data.deviceId)
    if (!stored) {
      return { ok: false, status: 500, error: '登记成功但未找到成员记录' }
    }

    const dto = toWorkspaceDto(getWorkspaceRepo().findById(payload.workspaceId) ?? workspace)
    publishP2pGroupSyncChange(dto)

    const output = P2pJoinRegisterOutputSchema.parse({
      ok: true,
      workspaceId: payload.workspaceId,
      workspaceName: workspace.name,
      member: {
        id: stored.id,
        deviceId: stored.deviceId,
        identityId: stored.identityId,
        displayName: stored.displayName,
        role: stored.role,
        status: stored.status === 'active' ? 'active' : 'invited',
        deviceKind: parsed.data.deviceKind,
      },
      inviteId: payload.inviteId,
      ownerDeviceId: payload.ownerDeviceId,
      ownerIdentityId: workspace.ownerIdentityId,
      offerSdp: getPendingInviteOffer(payload.inviteId),
      workspaceKeyB64: payload.workspaceKeyB64,
      iceServers: listInviteIceServers(),
      members: listWorkspaceMemberRoster(payload.workspaceId).map((member) => ({
        id: member.id,
        deviceId: member.deviceId,
        identityId: member.identityId ?? member.deviceId,
        displayName: member.displayName,
        role: member.role,
        status: member.status === 'invited' ? ('invited' as const) : ('active' as const),
        deviceKind: member.deviceKind,
      })),
    })
    return { ok: true, data: output }
  } catch (error) {
    if (error instanceof P2pMemberLimitError) {
      return { ok: false, status: 409, error: error.message }
    }
    const message = toErrorMessage(error, '邀请登记失败')
    logStructured('mobile-sync', 'warn', `p2p join register rejected: ${message}`)
    return { ok: false, status: 400, error: message }
  }
}

export async function handleMobileP2pInviteAnswer(
  raw: unknown,
): Promise<{ ok: true; data: P2pJoinInviteAnswerOutput } | { ok: false; status: number; error: string }> {
  const parsed = P2pJoinInviteAnswerInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, status: 400, error: '邀请应答参数无效' }
  }

  try {
    const { token } = parseInviteInput(parsed.data.inviteToken)
    const payload = decodeInviteToken(token)
    verifyInviteToken(payload)

    const workspace = getWorkspaceRepo().findById(payload.workspaceId)
    if (!workspace) {
      return { ok: false, status: 404, error: '群组不存在，或本机不是该群群主' }
    }
    const local = getP2pDeviceInfo()
    if (workspace.ownerDeviceId !== local.deviceId) {
      return { ok: false, status: 403, error: '只有群主电脑可以接受邀请应答' }
    }

    P2pBridge.inviteSubmitAnswer(payload.inviteId, parsed.data.answerSdp, parsed.data.deviceId)
    trustPeerSilentlyForWorkspaceMesh(
      payload.workspaceId,
      parsed.data.deviceId,
      parsed.data.displayName,
    )
    const output = P2pJoinInviteAnswerOutputSchema.parse({
      ok: true,
      inviteId: payload.inviteId,
      workspaceId: payload.workspaceId,
    })
    return { ok: true, data: output }
  } catch (error) {
    const message = toErrorMessage(error, '邀请应答失败')
    logStructured('mobile-sync', 'warn', `p2p invite answer rejected: ${message}`)
    return { ok: false, status: 400, error: message }
  }
}
