import type { ComponentType } from 'react'

import {
  IconExternalLink,
  IconFile,
  IconGlobe,
  IconImage,
  IconMessageBoard,
  IconNews,
} from '../../components/icons'

const NEWS_LIST_ICON_VARIANTS: Array<{
  Icon: ComponentType<{ size?: number; className?: string }>
  toneClass: string
}> = [
  { Icon: IconNews, toneClass: 'tm-community-news-icon--tone-0' },
  { Icon: IconGlobe, toneClass: 'tm-community-news-icon--tone-1' },
  { Icon: IconExternalLink, toneClass: 'tm-community-news-icon--tone-2' },
  { Icon: IconFile, toneClass: 'tm-community-news-icon--tone-3' },
  { Icon: IconMessageBoard, toneClass: 'tm-community-news-icon--tone-4' },
  { Icon: IconImage, toneClass: 'tm-community-news-icon--tone-5' },
]

function hashArticleId(articleId: string): number {
  let hash = 0
  for (let index = 0; index < articleId.length; index += 1) {
    hash = (hash * 31 + articleId.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function CommunityNewsListIcon({ articleId }: { articleId: string }) {
  const variant = NEWS_LIST_ICON_VARIANTS[hashArticleId(articleId) % NEWS_LIST_ICON_VARIANTS.length]!
  const { Icon, toneClass } = variant

  return (
    <div className={['tm-kb-file-card-icon', 'tm-community-news-icon', toneClass].join(' ')}>
      <Icon size={18} />
    </div>
  )
}
