import type { ReactNode } from 'react'

interface Props {
  displayName: string
  isSelf: boolean
  resourceCount: number
  selfLabel: string
  children: ReactNode
}

export function GroupMemberResourceSection({
  displayName,
  isSelf,
  resourceCount,
  selfLabel,
  children,
}: Props) {
  const avatarLabel = displayName.trim().slice(0, 1) || '?'

  return (
    <section className="tm-group-member-resource-section">
      <header className="tm-group-member-resource-section-header">
        <div className="tm-group-member-avatar" aria-hidden="true">
          {avatarLabel}
        </div>
        <div className="tm-group-member-resource-section-meta">
          <h3 className="tm-group-member-resource-section-title">
            {displayName}
            {isSelf ? <span className="tm-group-member-you">{selfLabel}</span> : null}
          </h3>
          <span className="tm-group-member-resource-section-count">{resourceCount}</span>
        </div>
      </header>
      <div className="tm-group-member-resource-section-body">{children}</div>
    </section>
  )
}
