import type { ReactNode, RefObject } from 'react'
import {
  IconCodeBlock,
  IconFormula,
  IconImage,
  IconLink,
  IconListBullet,
  IconListOrdered,
  IconOutline,
  IconQuote,
  IconRedo,
  IconTable,
  IconTaskList,
  IconUndo,
} from '../../components/icons'

const ICON_SIZE = 16

export type NoteToolbarActionKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'body'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'image'
  | 'codeblock'
  | 'quote'
  | 'task'
  | 'math'
  | 'table'
  | 'link'

type ToolbarItem = {
  key: NoteToolbarActionKey
  title: string
  label: ReactNode
  variant?: 'text' | 'icon' | 'heading' | 'body'
  dividerAfter?: boolean
  async?: boolean
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { key: 'bold', title: '加粗 (⌘B)', label: <strong>B</strong>, variant: 'text' },
  { key: 'italic', title: '斜体 (⌘I)', label: <em>I</em>, variant: 'text' },
  { key: 'underline', title: '下划线 (⌘U)', label: <span className="tm-notes-toolbar-underline">U</span>, variant: 'text' },
  { key: 'strike', title: '删除线', label: <span className="tm-notes-toolbar-strike">S</span>, variant: 'text' },
  { key: 'code', title: '行内代码', label: <span className="tm-notes-toolbar-code">&lt;&gt;</span>, variant: 'text', dividerAfter: true },
  { key: 'body', title: '正文', label: <span className="tm-notes-toolbar-body">T</span>, variant: 'body' },
  { key: 'h1', title: '标题 1', label: 'H1', variant: 'heading' },
  { key: 'h2', title: '标题 2', label: 'H2', variant: 'heading' },
  { key: 'h3', title: '标题 3', label: 'H3', variant: 'heading', dividerAfter: true },
  { key: 'bullet', title: '无序列表', label: <IconListBullet size={ICON_SIZE} />, variant: 'icon' },
  { key: 'ordered', title: '有序列表', label: <IconListOrdered size={ICON_SIZE} />, variant: 'icon', dividerAfter: true },
  { key: 'image', title: '插入图片', label: <IconImage size={ICON_SIZE} />, variant: 'icon', async: true },
  { key: 'codeblock', title: '代码块', label: <IconCodeBlock size={ICON_SIZE} />, variant: 'icon' },
  { key: 'quote', title: '引用', label: <IconQuote size={ICON_SIZE} />, variant: 'icon' },
  { key: 'task', title: '任务清单', label: <IconTaskList size={ICON_SIZE} />, variant: 'icon' },
  { key: 'math', title: '公式', label: <IconFormula size={ICON_SIZE} />, variant: 'icon' },
  { key: 'table', title: '表格', label: <IconTable size={ICON_SIZE} />, variant: 'icon', dividerAfter: true },
  { key: 'link', title: '链接 (⌘K)', label: <IconLink size={ICON_SIZE} />, variant: 'icon', async: true },
]

interface Props {
  bodyRef: RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  onRunAction: (key: NoteToolbarActionKey) => void
  onRunImage: () => void | Promise<void>
  onRunLink: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  showOutline?: boolean
  onToggleOutline?: () => void
}

export function NotesEditorToolbar({
  disabled = false,
  onRunAction,
  onRunImage,
  onRunLink,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  showOutline = false,
  onToggleOutline,
}: Props) {
  const handleClick = (item: ToolbarItem) => {
    if (disabled) return
    if (item.key === 'image') {
      void onRunImage()
      return
    }
    if (item.key === 'link') {
      onRunLink()
      return
    }
    onRunAction(item.key)
  }

  return (
    <div className="tm-notes-toolbar">
      <div className="tm-notes-toolbar-group">
        {TOOLBAR_ITEMS.map((item) => (
          <span key={item.key} className="tm-notes-toolbar-item">
            <button
              type="button"
              className={[
                'tm-notes-toolbar-btn',
                item.variant === 'icon' ? 'tm-notes-toolbar-btn--icon' : '',
                item.variant === 'heading' ? 'tm-notes-toolbar-btn--heading' : '',
                item.variant === 'body' ? 'tm-notes-toolbar-btn--body' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={item.title}
              disabled={disabled}
              onClick={() => handleClick(item)}
            >
              {item.label}
            </button>
            {item.dividerAfter ? <span className="tm-notes-toolbar-divider" /> : null}
          </span>
        ))}
        <span className="tm-notes-toolbar-divider" />
        <button
          type="button"
          className="tm-notes-toolbar-btn tm-notes-toolbar-btn--icon"
          title="撤销 (⌘Z)"
          disabled={disabled || !canUndo}
          onClick={onUndo}
        >
          <IconUndo size={ICON_SIZE} />
        </button>
        <button
          type="button"
          className="tm-notes-toolbar-btn tm-notes-toolbar-btn--icon"
          title="重做 (⌘⇧Z)"
          disabled={disabled || !canRedo}
          onClick={onRedo}
        >
          <IconRedo size={ICON_SIZE} />
        </button>
      </div>
      <div className="tm-notes-toolbar-end">
        <button
          type="button"
          className={[
            'tm-notes-toolbar-btn tm-notes-toolbar-btn--icon',
            showOutline ? 'tm-notes-toolbar-btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={showOutline ? '隐藏大纲' : '显示大纲'}
          aria-pressed={showOutline}
          onClick={onToggleOutline}
        >
          <IconOutline size={ICON_SIZE} />
        </button>
      </div>
    </div>
  )
}
