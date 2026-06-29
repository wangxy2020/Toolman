import { formatGroupMemberLimitMessage } from '@toolman/shared'

export class P2pMemberLimitError extends Error {
  readonly code = 'P2P_MEMBER_LIMIT' as const

  constructor(maxMembers = 10, message = formatGroupMemberLimitMessage(maxMembers)) {
    super(message)
    this.name = 'P2pMemberLimitError'
  }
}
