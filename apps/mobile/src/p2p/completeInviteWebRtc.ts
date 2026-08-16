import { decodeWorkspaceKeyB64, type P2pJoinRegisterOutput } from '@toolman/shared'
import type { InviteSelf } from './applyInvite'
import type { PendingP2pInvite } from './inviteParse'
import { canJoinViaWebRtc, joinOwnerViaWebRtc } from './joinWebRtc'
import { startMailboxSync } from './mailboxSync'
import { recordP2pPathMetric } from './pathMetrics'
import { resolveJoinSession } from './unpackInvite'

export type CompleteInviteWebRtcResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: 'no-webrtc' | 'no-offer'; message: string }
  | { ok: false; skipped?: false; message: string }

export async function completeInviteWebRtcJoin(input: {
  invite: PendingP2pInvite
  register: P2pJoinRegisterOutput
  hubUrl: string
  self: InviteSelf
}): Promise<CompleteInviteWebRtcResult> {
  const session = await resolveJoinSession({
    invite: input.invite,
    register: input.register,
  })
  if (session.workspaceKeyB64) {
    try {
      startMailboxSync({
        hubUrl: input.hubUrl,
        workspaceId: input.register.workspaceId,
        deviceId: input.self.deviceId,
        workspaceKey: decodeWorkspaceKeyB64(session.workspaceKeyB64),
        inviteToken: session.inviteToken,
        ownerDeviceId: input.register.ownerDeviceId,
      })
    } catch {
      // mailbox is optional; WebRTC join can still proceed
    }
  }

  if (!canJoinViaWebRtc()) {
    return {
      ok: false,
      skipped: true,
      reason: 'no-webrtc',
      message: '当前环境没有 WebRTC，已完成登记。离线变更将走加密信箱。',
    }
  }

  if (!session.offerSdp || !session.workspaceKeyB64) {
    return {
      ok: false,
      skipped: true,
      reason: 'no-offer',
      message: '已登记，但缺少通话描述，请让群主重新生成邀请',
    }
  }

  const joined = await joinOwnerViaWebRtc({
    hubUrl: input.hubUrl,
    inviteToken: session.inviteToken,
    deviceId: input.self.deviceId,
    identityId: input.self.identityId,
    displayName: input.self.displayName,
    memberId: input.register.member.id,
    ownerDeviceId: input.register.ownerDeviceId || session.workspaceId,
    workspaceId: session.workspaceId,
    workspaceKeyB64: session.workspaceKeyB64,
    offerSdp: session.offerSdp,
    iceServers: session.iceServers,
  })
  if (joined.ok) {
    recordP2pPathMetric('joinDirectOk')
    return { ok: true }
  }
  recordP2pPathMetric('joinFailed')
  return { ok: false, message: joined.message }
}
