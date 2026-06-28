import { useEffect } from 'react'
import { ensureGroupWorkspaceBootstrapped } from './group-p2p-sync-policy'

/** 进入群组页：本会话内对该 workspace 做一次 bootstrap */
export function useGroupWorkspaceBootstrap(workspaceId: string | null) {
  useEffect(() => {
    ensureGroupWorkspaceBootstrapped(workspaceId)
  }, [workspaceId])
}
