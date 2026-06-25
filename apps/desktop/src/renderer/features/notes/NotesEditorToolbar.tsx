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
import { getNotesToolbarTitles } from '../../i18n/notes-editor-labels'
import { useI18n } from '../../i18n/useI18n'

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
  const { t } = useI18n()
  const titles = getNotesToolbarTitles(t)

  const toolbarItems: ToolbarItem[] = [
    { key: 'bold', title: titles.bold, label: <strong>B</strong>, variant: 'text' },
    { key: 'italic', title: titles.italic, label: <em>I</em>, variant: 'text' },
    {
      key: 'underline',
      title: titles.underline,
      label: <span className="tm-notes-toolbar-underline">U</span>,
      variant: 'text',
    },
    {
      key: 'strike',
      title: titles.strike,
      label: <span className="tm-notes-toolbar-strike">S</span>,
      variant: 'text',
    },
    {
      key: 'code',
      title: titles.code,
      label: <span className="tm-notes-toolbar-code">&lt;&gt;</span>,
      variant: 'text',
      dividerAfter: true,
    },
    {
      key: 'body',
      title: titles.body,
      label: <span className="tm-notes-toolbar-body">T</span>,
      variant: 'body',
    },
    { key: 'h1', title: titles.h1, label: 'H1', variant: 'heading' },
    { key: 'h2', title: titles.h2, label: 'H2', variant: 'heading' },
    { key: 'h3', title: titles.h3, label: 'H3', variant: 'heading', dividerAfter: true },
    { key: 'bullet', title: titles.bullet, label: <IconListBullet size={ICON_SIZE} />, variant: 'icon' },
    { key: 'ordered', title: titles.ordered, label: <IconListOrdered size={ICON_SIZE} />, variant: 'icon', dividerAfter: true },
    { key: 'image', title: titles.image, label: <IconImage size={ICON_SIZE} />, variant: 'icon', async: true },
    { key: 'codeblock', title: titles.codeblock, label: <IconCodeBlock size={ICON_SIZE} />, variant: 'icon' },
    { key: 'quote', title: titles.quote, label: <IconQuote size={ICON_SIZE} />, variant: 'icon' },
    { key: 'task', title: titles.task, label: <IconTaskList size={ICON_SIZE} />, variant: 'icon' },
    { key: 'math', title: titles.math, label: <IconFormula size={ICON_SIZE} />, variant: 'icon' },
    { key: 'table', title: titles.table, label: <IconTable size={ICON_SIZE} />, variant: 'icon', dividerAfter: true },
    { key: 'link', title: titles.link, label: <IconLink size={ICON_SIZE} />, variant: 'icon', async: true },
  ]

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
        {toolbarItems.map((item) => (
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
          title={t('notesPage.editor.toolbar.undo')}
          disabled={disabled || !canUndo}
          onClick={onUndo}
        >
          <IconUndo size={ICON_SIZE} />
        </button>
        <button
          type="button"
          className="tm-notes-toolbar-btn tm-notes-toolbar-btn--icon"
          title={t('notesPage.editor.toolbar.redo')}
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
          title={showOutline ? t('notesPage.editor.outlineHide') : t('notesPage.editor.outlineShow')}
          aria-pressed={showOutline}
          onClick={onToggleOutline}
        >
          <IconOutline size={ICON_SIZE} />
        </button>
      </div>
    </div>
  )
}
