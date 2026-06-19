import type { Session } from '@toolman/shared'
import { SessionListItem } from './SessionListItem'

interface Props {
  sessions: Session[]
  activeSessionId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  loading,
  onSelect,
  onCreate,
  onDelete,
}: Props) {
  return (
    <div style={styles.wrap}>
      <button style={styles.newBtn} onClick={onCreate}>
        + 新对话
      </button>
      <div style={styles.list}>
        {loading && sessions.length === 0 && <div style={styles.empty}>加载中…</div>}
        {!loading && sessions.length === 0 && <div style={styles.empty}>暂无对话，点击上方新建</div>}
        {sessions.map((s) => (
          <SessionListItem
            key={s.id}
            session={s}
            isActive={activeSessionId === s.id}
            onSelect={() => onSelect(s.id)}
            onDelete={() => onDelete(s.id)}
          />
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: 8,
    minHeight: 0,
  },
  newBtn: {
    margin: '0 8px',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #4f46e5',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    fontWeight: 500,
    fontSize: 14,
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '0 8px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  empty: {
    padding: 16,
    color: '#9aa0a6',
    fontSize: 13,
    textAlign: 'center',
  },
}
