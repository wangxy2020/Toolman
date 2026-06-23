import { useEffect, useState } from 'react'
import type { AuthSession, P2pWorkspace } from '@toolman/shared'
import { shouldWarnGroupMemberLimit } from '@toolman/shared'
import {
  hasShownGroupMemberLimitWarning,
  markGroupMemberLimitWarningShown,
} from './group-member-limit-warning'

interface Options {
  workspace: P2pWorkspace | null
  memberCount: number
  session: AuthSession | null
}

export function useGroupMemberLimitWarning({ workspace, memberCount, session }: Options) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!workspace || !session) {
      setOpen(false)
      return
    }

    const shouldWarn = shouldWarnGroupMemberLimit(
      {
        subscriptionSku: session.subscriptionSku,
        entitlements: session.entitlements,
      },
      memberCount,
      workspace.maxMembers,
    )

    if (!shouldWarn || hasShownGroupMemberLimitWarning(workspace.id)) {
      setOpen(false)
      return
    }

    markGroupMemberLimitWarningShown(workspace.id)
    setOpen(true)
  }, [workspace, memberCount, session])

  return {
    open,
    dismiss: () => setOpen(false),
  }
}
