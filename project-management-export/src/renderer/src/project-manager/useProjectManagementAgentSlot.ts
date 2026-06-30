import { useActiveAgent } from '@renderer/hooks/agents/useActiveAgent'
import { useAgents } from '@renderer/hooks/agents/useAgents'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useEffect, useRef } from 'react'

import type { ProjectManagementAgentSlot } from './projectManagementAgentSlots'
import { resolveAgentIdForSlot, setBoundAgentId } from './projectManagementAgentSlots'

/**
 * 进入项目管理某模块的智能体页时，切换到该槽位绑定的 Agent；
 * 用户在当前槽位页内切换 Agent 时，写回绑定。
 */
export const useProjectManagementAgentSlot = (
  slot: ProjectManagementAgentSlot | undefined,
  activationKey: string | undefined
) => {
  const { agents } = useAgents()
  const { chat } = useRuntime()
  const { activeAgentId } = chat
  const { setActiveAgentId } = useActiveAgent()
  const canPersistBindingRef = useRef(false)
  /** 当前 activationKey 是否已完成一次槽位切换（勿在切换前标记） */
  const appliedActivationKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activationKey) {
      appliedActivationKeyRef.current = null
      canPersistBindingRef.current = false
    }
  }, [activationKey])

  // 仅在进入模块智能体页 / 切换模块时激活，不依赖 activeAgentId（避免覆盖用户侧栏点击）
  useEffect(() => {
    if (!slot || !activationKey) {
      canPersistBindingRef.current = false
      return
    }

    if (!agents?.length) {
      canPersistBindingRef.current = false
      return
    }

    if (appliedActivationKeyRef.current === activationKey) {
      canPersistBindingRef.current = true
      return
    }

    const targetId = resolveAgentIdForSlot(slot, agents)
    if (!targetId) {
      canPersistBindingRef.current = false
      return
    }

    canPersistBindingRef.current = false
    let cancelled = false

    void setActiveAgentId(targetId).finally(() => {
      if (cancelled) {
        return
      }
      appliedActivationKeyRef.current = activationKey
      setBoundAgentId(slot, targetId)
      canPersistBindingRef.current = true
    })

    return () => {
      cancelled = true
    }
  }, [slot, activationKey, agents, setActiveAgentId])

  // 用户在本页侧栏手动切换智能体后，写回当前槽位绑定
  useEffect(() => {
    if (!slot || !activeAgentId || !canPersistBindingRef.current) {
      return
    }
    if (appliedActivationKeyRef.current !== activationKey) {
      return
    }
    setBoundAgentId(slot, activeAgentId)
  }, [slot, activationKey, activeAgentId])
}
