import { useState } from 'react'
import { IconCheck, IconChevronRight } from '../../components/icons'
import { parseToolResult, summarizeToolResult } from './parse-tool-result'
import {
  parseToolArguments,
  resolveToolDisplayMeta,
  usesCommandStyle,
} from './tool-display-meta'
import { ToolResultView } from './ToolResultView'

interface Props {
  name: string
  arguments?: string
  result: string
  status: 'done' | 'running'
  defaultCollapsed?: boolean
}

function SimpleToolCard({
  name,
  result,
  status,
  defaultCollapsed,
}: Omit<Props, 'arguments'>) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)
  const hasResult = result.trim().length > 0

  return (
    <div
      className={[
        'tm-tool-card',
        status === 'running' ? 'tm-tool-card--running' : '',
        collapsed ? 'tm-tool-card--collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="tm-tool-card-head"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className="tm-tool-card-chevron" aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
        <span className="tm-tool-card-icon" aria-hidden="true">
          {status === 'running' ? '⏳' : '🔧'}
        </span>
        <span className="tm-tool-card-name">{name}</span>
        <span className="tm-tool-card-status">
          {status === 'running' ? '执行中…' : '已完成'}
        </span>
      </button>

      {!collapsed && (
        <div className="tm-tool-card-body">
          {hasResult ? (
            <ToolResultView toolName={name} result={result} />
          ) : (
            <div className="tm-tool-card-empty">
              {status === 'running' ? '等待工具返回…' : '无输出'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CommandStatus({ status }: { status: 'done' | 'running' }) {
  return (
    <span className="tm-tool-card-status tm-tool-card-status--done">
      {status === 'running' ? (
        '执行中…'
      ) : (
        <>
          <span>已完成</span>
          <IconCheck size={14} className="tm-tool-card-check" />
        </>
      )}
    </span>
  )
}

function CommandHeader({
  title,
  description,
  status,
  collapsed,
}: {
  title: string
  description: string
  status: 'done' | 'running'
  collapsed: boolean
}) {
  return (
    <div className="tm-tool-card-head-top">
      <span className="tm-tool-card-terminal" aria-hidden="true">
        &gt;_
      </span>
      <span className="tm-tool-card-title">{title}</span>
      <span className="tm-tool-card-desc">{description}</span>
      <CommandStatus status={status} />
      <span className="tm-tool-card-fold" aria-hidden="true">
        <IconChevronRight size={14} open={!collapsed} />
      </span>
    </div>
  )
}

function CommandToolCard({ name, arguments: argsRaw, result, status, defaultCollapsed }: Props) {
  const meta = resolveToolDisplayMeta(name)
  const args = parseToolArguments(argsRaw)
  const command = meta.buildCommand(args)
  const parsed = parseToolResult(name, result)
  const summary =
    status === 'done' && result.trim()
      ? summarizeToolResult(parsed, result)
      : null
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? status === 'done')
  const hasResult = result.trim().length > 0

  return (
    <div className="tm-tool-exec">
      <div
        className={[
          'tm-tool-card',
          'tm-tool-card--command',
          status === 'running' ? 'tm-tool-card--running' : '',
          collapsed ? 'tm-tool-card--collapsed' : 'tm-tool-card--expanded',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          type="button"
          className="tm-tool-card-head tm-tool-card-head--command"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
        >
          <CommandHeader
            title={meta.title}
            description={meta.description}
            status={status}
            collapsed={collapsed}
          />
        </button>

        {!collapsed && (
          <div className="tm-tool-card-body tm-tool-card-body--command">
            <div className="tm-tool-section">
              <div className="tm-tool-section-label">命令</div>
              <pre className="tm-tool-section-code">{command || name}</pre>
            </div>
            <div className="tm-tool-section">
              <div className="tm-tool-section-label">输出</div>
              <div className="tm-tool-section-output">
                {hasResult ? (
                  <ToolResultView toolName={name} result={result} />
                ) : (
                  <div className="tm-tool-card-empty">
                    {status === 'running' ? '等待工具返回…' : '无输出'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {summary ? <p className="tm-tool-exec-summary">{summary}</p> : null}
    </div>
  )
}

export function ToolCallCard(props: Props) {
  if (usesCommandStyle(props.name)) {
    return <CommandToolCard {...props} />
  }
  return <SimpleToolCard {...props} />
}
