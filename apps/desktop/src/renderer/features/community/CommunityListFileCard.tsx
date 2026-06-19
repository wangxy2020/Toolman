import type { ReactNode } from 'react'

import { CommunityListCoverIcon } from './CommunityListCoverIcon'

interface Props {
  title: string
  meta?: ReactNode
  description?: string
  selected?: boolean
  onClick?: () => void
  icon?: ReactNode
  coverUrl?: string | null
}

export function CommunityListFileCard({
  title,
  meta,
  description,
  selected = false,
  onClick,
  icon,
  coverUrl,
}: Props) {
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={[
        'tm-kb-file-card',
        onClick ? 'tm-kb-file-card--clickable' : '',
        selected ? 'tm-kb-file-card--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      title={title}
    >
      {icon || coverUrl != null ? (
        <CommunityListCoverIcon coverUrl={coverUrl} fallback={icon} alt={title} />
      ) : null}
      <div className="tm-kb-file-card-main">
        <div className="tm-kb-file-card-title">{title}</div>
        {meta ? <div className="tm-kb-file-card-meta">{meta}</div> : null}
        <div
          className={[
            'tm-kb-file-card-meta',
            'tm-community-list-file-card-desc',
            description ? '' : 'tm-community-list-file-card-desc--empty',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={!description}
        >
          {description || '\u00a0'}
        </div>
      </div>
    </Tag>
  )
}
