import { IconFile, IconFolder } from '../../components/icons'
import type { ParsedToolResult } from './parse-tool-result'
import { parseToolResult, splitPathParts } from './parse-tool-result'

interface Props {
  toolName: string
  result: string
}

function FsListView({ entries }: { entries: Extract<ParsedToolResult, { type: 'fs_list' }>['entries'] }) {
  return (
    <ul className="tm-tool-file-list-items">
      {entries.map((entry) => (
        <li
          key={`${entry.kind}-${entry.name}`}
          className={`tm-tool-file-item tm-tool-file-item--${entry.kind}`}
          title={entry.name}
        >
          <span className="tm-tool-file-icon" aria-hidden="true">
            {entry.kind === 'dir' ? <IconFolder size={15} /> : <IconFile size={15} />}
          </span>
          <span className="tm-tool-file-name">{entry.name}</span>
          <span className="tm-tool-file-kind">{entry.kind === 'dir' ? '文件夹' : '文件'}</span>
        </li>
      ))}
    </ul>
  )
}

function GlobListView({ paths }: { paths: string[] }) {
  return (
    <ul className="tm-tool-file-list-items">
      {paths.map((path) => {
        const { name, parent } = splitPathParts(path)
        return (
          <li key={path} className="tm-tool-file-item tm-tool-file-item--file" title={path}>
            <span className="tm-tool-file-icon" aria-hidden="true">
              <IconFile size={15} />
            </span>
            <span className="tm-tool-file-name">{name}</span>
            {parent ? <span className="tm-tool-file-parent">{parent}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

function LineListView({ lines }: { lines: string[] }) {
  return (
    <ul className="tm-tool-file-list-items">
      {lines.map((line) => (
        <li key={line} className="tm-tool-file-item tm-tool-file-item--file" title={line}>
          <span className="tm-tool-file-icon" aria-hidden="true">
            <IconFile size={15} />
          </span>
          <span className="tm-tool-file-name">{line}</span>
        </li>
      ))}
    </ul>
  )
}

export function ToolResultView({ toolName, result }: Props) {
  const parsed = parseToolResult(toolName, result)

  if (parsed.type === 'fs_list') {
    return <FsListView entries={parsed.entries} />
  }

  if (parsed.type === 'glob') {
    if (!parsed.paths.length) {
      return <div className="tm-tool-output-empty">{parsed.summary}</div>
    }
    return <GlobListView paths={parsed.paths} />
  }

  if (parsed.type === 'line_list') {
    return <LineListView lines={parsed.lines} />
  }

  return <pre className="tm-tool-output-raw">{result}</pre>
}
