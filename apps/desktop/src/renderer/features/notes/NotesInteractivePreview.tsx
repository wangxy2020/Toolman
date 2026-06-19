import { useMemo, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { MessageSettings } from '../chat/message-settings'
import { preprocessWikiLinks } from './notes-links'
import type { NoteItem } from './notes-storage'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

interface Props {
  title: string
  content: string
  notes: NoteItem[]
  messageSettings: MessageSettings
  onNavigateNote?: (noteId: string) => void
  onToggleTask?: (lineIndex: number, checked: boolean) => void
}

export function NotesInteractivePreview({
  title,
  content,
  notes,
  onNavigateNote,
  onToggleTask,
}: Props) {
  const markdown = useMemo(() => {
    const body = content.trim()
    if (!body) return ''
    return preprocessWikiLinks(`# ${title}\n\n${body}`, notes)
  }, [content, notes, title])

  const components = useMemo<Components>(() => {
    let taskLineIndex = -1
    const headingIndexRef = { current: 0 }
    const headingComponents = Object.fromEntries(
      HEADING_TAGS.map((tag) => [
        tag,
        ({ children, ...props }: ComponentProps<'h1'>) => {
          const id = `note-heading-${headingIndexRef.current}`
          headingIndexRef.current += 1
          const Tag = tag
          return (
            <Tag id={id} {...props}>
              {children}
            </Tag>
          )
        },
      ]),
    ) as Components

    return {
      ...headingComponents,
      a({ href, children, ...props }) {
        if (href?.startsWith('note://')) {
          const noteId = href.replace('note://', '')
          return (
            <button
              type="button"
              className="tm-notes-wikilink"
              onClick={() => onNavigateNote?.(noteId)}
            >
              {children}
            </button>
          )
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
            {children}
          </a>
        )
      },
      li({ children, ...props }) {
        const text = String(children)
        const taskMatch = text.match(/^\[([ xX])\]\s*(.*)$/)
        if (!taskMatch) {
          return <li {...props}>{children}</li>
        }
        const checked = taskMatch[1]?.toLowerCase() === 'x'
        const label = taskMatch[2] ?? ''
        const index = (taskLineIndex += 1)
        return (
          <li className="tm-notes-task-item" {...props}>
            <label className="tm-notes-task-label">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onToggleTask?.(index, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          </li>
        )
      },
      input({ type, checked, ...props }) {
        if (type === 'checkbox') {
          return <input type="checkbox" checked={Boolean(checked)} readOnly {...props} />
        }
        return <input type={type} checked={checked} {...props} />
      },
    }
  }, [onNavigateNote, onToggleTask])

  if (!markdown) {
    return <p className="tm-notes-editor-preview-empty">暂无内容可预览</p>
  }

  return (
    <div className="tm-notes-interactive-preview tm-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
