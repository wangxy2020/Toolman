import { useState, type ReactNode } from 'react'

interface Props {
  coverUrl?: string | null
  fallback: ReactNode
  alt?: string
}

export function CommunityListCoverIcon({ coverUrl, fallback, alt = '' }: Props) {
  const [failed, setFailed] = useState(false)
  const showCover = Boolean(coverUrl) && !failed

  return (
    <div
      className={[
        'tm-kb-file-card-icon',
        showCover ? 'tm-kb-file-card-icon--cover' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showCover ? (
        <img
          src={coverUrl!}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  )
}
