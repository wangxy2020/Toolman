import type { ContentBlock } from '@toolman/shared'
import type { MessageSettings } from './message-settings'
import { MessageImageBlock } from './MessageImageBlock'
import { MessageMarkdown } from './MessageMarkdown'
import { parseMessageSegments } from './parse-message-content'
import { ToolCallCard } from './ToolCallCard'
import { StreamingPlaceholder } from './StreamingPlaceholder'
import { ThinkingBlock } from './ThinkingBlock'
import { KnowledgeSourcesBlock } from './KnowledgeSourcesBlock'
import { LocalFileLinksBlock } from './LocalFileLinksBlock'
import { DocxReviewSummaryBlock } from './DocxReviewSummaryBlock'
import { hasStructuredBlocks } from './apply-stream-delta'
import { getBlocksText, orderContentBlocks } from './message-utils'
import { useThinkingMetrics } from './useThinkingMetrics'

interface Props {
  contentBlocks: ContentBlock[]
  streaming: boolean
  settings: MessageSettings
}

export function MessageContent({ contentBlocks, streaming, settings }: Props) {
  const orderedBlocks = orderContentBlocks(contentBlocks)
  const text = getBlocksText(orderedBlocks)
  const structured = hasStructuredBlocks(orderedBlocks)
  const { active: thinkingActive, durationSeconds: liveDurationSeconds } = useThinkingMetrics(
    streaming,
    orderedBlocks,
  )
  const hasVisibleContent =
    text.trim().length > 0 ||
    orderedBlocks.some(
      (block) =>
        block.type === 'image' ||
        block.type === 'local_file_links' ||
        block.type === 'docx_review_summary',
    )

  if (!structured && !hasVisibleContent) {
    if (streaming) return <StreamingPlaceholder />
    return null
  }

  if (structured) {
    const hasRunningTool = orderedBlocks.some(
      (block) => block.type === 'tool' && block.status === 'running',
    )

    return (
      <div className="tm-message-content">
        {orderedBlocks.map((block, index) => {
          if (block.type === 'thinking') {
            const storedDuration = block.durationSeconds ?? 0
            const displayDuration = streaming
              ? liveDurationSeconds
              : Math.max(storedDuration, liveDurationSeconds)

            return (
              <ThinkingBlock
                key={`thinking-${index}`}
                text={block.text}
                defaultCollapsed={settings.autoCollapseThinking}
                active={thinkingActive}
                durationSeconds={displayDuration}
              />
            )
          }

          if (block.type === 'tool') {
            return (
              <ToolCallCard
                key={`tool-${block.toolCallId}`}
                name={block.name}
                arguments={block.arguments}
                result={block.result ?? ''}
                status={block.status === 'running' ? 'running' : 'done'}
                defaultCollapsed={block.status !== 'running'}
              />
            )
          }

          if (block.type === 'kb_sources') {
            return <KnowledgeSourcesBlock key={`kb-sources-${index}`} sources={block.sources} />
          }

          if (block.type === 'image') {
            if (!block.blobHash?.trim()) return null
            return (
              <MessageImageBlock
                key={`image-${block.blobHash}-${index}`}
                blobHash={block.blobHash}
                mimeType={block.mimeType}
                alt={block.alt}
              />
            )
          }

          if (block.type === 'text' && block.text.trim()) {
            return (
              <MessageMarkdown
                key={`md-${index}`}
                text={block.text}
                settings={settings}
                sanitizeAssistant
              />
            )
          }

          if (block.type === 'docx_review_summary') {
            return (
              <DocxReviewSummaryBlock key={`docx-review-summary-${index}`} summary={block} />
            )
          }

          if (block.type === 'local_file_links') {
            return (
              <LocalFileLinksBlock
                key={`local-file-links-${index}`}
                paths={block.paths}
              />
            )
          }

          return null
        })}
        {streaming && !hasRunningTool && text.trim() ? (
          <span className="tm-stream-cursor" aria-hidden="true" />
        ) : null}
      </div>
    )
  }

  const segments = parseMessageSegments(text, streaming)
  const hasToolCards = segments.some((segment) => segment.type === 'tool')

  return (
    <div className="tm-message-content">
      {segments.map((segment, index) => {
        if (segment.type === 'tool') {
          return (
            <ToolCallCard
              key={`tool-${segment.name}-${index}`}
              name={segment.name}
              arguments={segment.arguments}
              result={segment.result}
              status={segment.status}
              defaultCollapsed={segment.status === 'done'}
            />
          )
        }

        return (
          <MessageMarkdown
            key={`md-${index}`}
            text={segment.text}
            settings={settings}
            sanitizeAssistant
          />
        )
      })}
      {streaming && !hasToolCards ? <span className="tm-stream-cursor" aria-hidden="true" /> : null}
    </div>
  )
}
