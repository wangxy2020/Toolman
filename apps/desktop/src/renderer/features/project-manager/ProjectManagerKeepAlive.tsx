import type { ReactNode } from 'react'
import { memo } from 'react'

/** Keep visited panels mounted, but freeze inactive ones so parent re-renders
 * (e.g. chat context updates) do not re-render hidden heavy trees.
 */
export const KeepAliveSlotBody = memo(
  function KeepAliveSlotBody({
    active,
    children,
  }: {
    active: boolean
    children: ReactNode
  }) {
    return (
      <div className="tm-pm-panel-slot" hidden={!active} aria-hidden={!active}>
        {children}
      </div>
    )
  },
  (prev, next) => {
    if (!prev.active && !next.active) return true
    return false
  },
)

export function KeepAliveSlot({
  active,
  mounted,
  children,
}: {
  active: boolean
  mounted: boolean
  children: ReactNode
}) {
  if (!mounted) return null
  return <KeepAliveSlotBody active={active}>{children}</KeepAliveSlotBody>
}

export const AgentKeepAliveRoot = memo(
  function AgentKeepAliveRoot({
    active,
    children,
  }: {
    active: boolean
    children: ReactNode
  }) {
    return (
      <div className={active ? 'tm-pm-agent-root' : 'tm-pm-view-hidden'} aria-hidden={!active}>
        {children}
      </div>
    )
  },
  (prev, next) => {
    if (!prev.active && !next.active) return true
    return false
  },
)
