import type { Session } from '@toolman/shared'
import { IconMore } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { translateSessionTitle } from '../../i18n/system-labels'
import { formatSessionTime, getSessionDisplayTime } from './session-utils'

interface Props {
  session: Session
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}

export function SessionListItem({ session, isActive, onSelect, onDelete }: Props) {
  const { t } = useI18n()
  const displayTime = getSessionDisplayTime(session)
  const displayTitle = translateSessionTitle(session.title, t)

  return (
    <div className={`tm-list-item ${isActive ? 'tm-list-item--active' : ''}`}>
      <span className="tm-list-item-icon">💬</span>
      <button
        type="button"
        className="tm-list-item-body"
        style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}
        onClick={onSelect}
      >
        <div className="tm-list-item-title">{displayTitle}</div>
        <div className="tm-list-item-meta">{formatSessionTime(displayTime)}</div>
      </button>
      <button
        type="button"
        className="tm-list-item-menu"
        title="删除话题"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <IconMore />
      </button>
    </div>
  )
}
