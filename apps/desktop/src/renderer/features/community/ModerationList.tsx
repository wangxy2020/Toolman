import type { ReactNode } from 'react'

export function ModerationList<T>({
  items,
  empty,
  renderItem,
}: {
  items: T[]
  empty: ReactNode
  renderItem: (item: T) => ReactNode
}) {
  if (items.length === 0) {
    return <div className="tm-user-center-empty">{empty}</div>
  }

  return <div className="tm-user-center-feed-list">{items.map(renderItem)}</div>
}
