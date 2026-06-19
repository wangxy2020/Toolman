import { IconChevronDown, IconChevronUp, IconPlus } from '../../components/icons'
import { createDefaultBlocks } from './notes-blocks'
import { createNoteBlockId, type NoteBlock, type NoteBlockType } from './notes-storage'

const BLOCK_LABELS: Record<NoteBlockType, string> = {
  paragraph: '正文',
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  bullet: '列表',
  ordered: '编号',
  quote: '引用',
  code: '代码',
  task: '待办',
  divider: '分隔',
}

interface Props {
  blocks: NoteBlock[]
  locked?: boolean
  onChange: (blocks: NoteBlock[]) => void
}

function blockInputRows(block: NoteBlock): number {
  if (block.type === 'code') return Math.max(4, block.text.split('\n').length)
  return Math.max(1, Math.min(16, block.text.split('\n').length))
}

export function NotesBlockEditor({ blocks, locked = false, onChange }: Props) {
  const items = blocks.length > 0 ? blocks : createDefaultBlocks()

  const updateBlock = (id: string, patch: Partial<NoteBlock>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const addBlock = (type: NoteBlockType = 'paragraph') => {
    onChange([...items, { id: createNoteBlockId(), type, text: '' }])
  }

  const removeBlock = (id: string) => {
    const next = items.filter((item) => item.id !== id)
    onChange(next.length > 0 ? next : createDefaultBlocks())
  }

  const moveBlock = (id: string, direction: -1 | 1) => {
    const index = items.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= items.length) return
    const next = [...items]
    const [picked] = next.splice(index, 1)
    next.splice(target, 0, picked!)
    onChange(next)
  }

  return (
    <div className="tm-notes-block-editor">
      {items.map((block) => (
        <div key={block.id} className="tm-notes-block-row" data-block-id={block.id}>
          <div className="tm-notes-block-controls">
            <span className="tm-notes-block-type">{BLOCK_LABELS[block.type]}</span>
            <button type="button" disabled={locked} onClick={() => moveBlock(block.id, -1)}>
              <IconChevronUp size={12} />
            </button>
            <button type="button" disabled={locked} onClick={() => moveBlock(block.id, 1)}>
              <IconChevronDown size={12} />
            </button>
            <button type="button" disabled={locked} onClick={() => removeBlock(block.id)}>
              ×
            </button>
          </div>
          {block.type === 'divider' ? (
            <div className="tm-notes-block-divider">---</div>
          ) : block.type === 'task' ? (
            <label className="tm-notes-block-task">
              <input
                type="checkbox"
                checked={Boolean(block.checked)}
                disabled={locked}
                onChange={(event) => updateBlock(block.id, { checked: event.target.checked })}
              />
              <input
                className="tm-notes-block-input"
                value={block.text}
                readOnly={locked}
                placeholder="待办内容"
                onChange={(event) => updateBlock(block.id, { text: event.target.value })}
              />
            </label>
          ) : (
            <textarea
              className={[
                'tm-notes-block-input',
                block.type.startsWith('h') ? `tm-notes-block-input--${block.type}` : '',
                block.type === 'code' ? 'tm-notes-block-input--code' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              value={block.text}
              readOnly={locked}
              rows={blockInputRows(block)}
              placeholder="输入内容"
              onChange={(event) => updateBlock(block.id, { text: event.target.value })}
            />
          )}
        </div>
      ))}
      <button type="button" className="tm-notes-block-add" disabled={locked} onClick={() => addBlock()}>
        <IconPlus size={14} />
        添加块
      </button>
    </div>
  )
}
