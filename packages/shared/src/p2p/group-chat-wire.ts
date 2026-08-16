export const GROUP_CHAT_SIGN_PAYLOAD_VERSION = 1

export type GroupChatSignFields = {
  id: string
  workspaceId: string
  senderMemberId: string
  senderName: string
  createdAt: number
}

export function buildGroupChatMessageSignPayload(
  message: GroupChatSignFields,
  contentHashHex: string,
): string {
  return JSON.stringify({
    v: GROUP_CHAT_SIGN_PAYLOAD_VERSION,
    id: message.id,
    workspaceId: message.workspaceId,
    senderMemberId: message.senderMemberId,
    senderName: message.senderName,
    createdAt: message.createdAt,
    contentHash: contentHashHex,
  })
}

export function buildGroupChatClearSignPayload(input: {
  workspaceId: string
  clearedAt: number
}): string {
  return JSON.stringify({
    v: GROUP_CHAT_SIGN_PAYLOAD_VERSION,
    type: 'group-chat.clear',
    workspaceId: input.workspaceId,
    clearedAt: input.clearedAt,
  })
}
