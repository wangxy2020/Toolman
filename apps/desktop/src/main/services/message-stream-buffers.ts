import type { ContentBlock, KnowledgeCitation, StreamDelta } from '@toolman/shared'

type ToolBuffer = {
  toolCallId: string
  name: string
  arguments?: string
  result: string
  status: 'running' | 'done' | 'failed'
}

export class MessageStreamBuffers {
  private text = ''
  private thinking = ''
  private thinkingStartedAt: number | null = null
  private thinkingDurationSeconds: number | null = null
  private kbSources: KnowledgeCitation[] = []
  private localFileLinks: string[] = []
  private readonly tools: ToolBuffer[] = []

  appendText(chunk: string): void {
    if (chunk && this.thinking && this.thinkingDurationSeconds === null) {
      this.finalizeThinkingDuration()
    }
    this.text += chunk
  }

  appendStatus(chunk: string): void {
    if (chunk && this.thinkingStartedAt === null) {
      this.thinkingStartedAt = Date.now()
    }
    this.thinking += chunk
  }

  appendThinking(chunk: string): void {
    if (chunk && this.thinkingStartedAt === null) {
      this.thinkingStartedAt = Date.now()
    }
    this.thinking += chunk
  }

  clearThinking(): void {
    this.thinking = ''
    this.thinkingStartedAt = null
    this.thinkingDurationSeconds = null
  }

  promoteThinkingToText(): boolean {
    const answer = this.thinking.trim()
    if (this.text.trim() || !answer) return false
    this.text = answer
    this.thinking = ''
    this.thinkingStartedAt = null
    this.thinkingDurationSeconds = null
    return true
  }

  setKbSources(sources: KnowledgeCitation[]): void {
    this.kbSources = sources
  }

  setLocalFileLinks(paths: string[]): void {
    this.localFileLinks = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  }

  upsertTool(update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }): StreamDelta {
    const existing = this.tools.find((tool) => tool.toolCallId === update.toolCallId)
    if (existing) {
      existing.name = update.name
      if (update.arguments !== undefined) existing.arguments = update.arguments
      if (update.result !== undefined) existing.result = update.result
      existing.status = update.status
    } else {
      this.tools.push({
        toolCallId: update.toolCallId,
        name: update.name,
        arguments: update.arguments,
        result: update.result ?? '',
        status: update.status,
      })
    }

    return {
      type: 'tool',
      toolCallId: update.toolCallId,
      name: update.name,
      arguments: update.arguments,
      result: update.result,
      status: update.status,
    }
  }

  finalizeThinkingDuration(): void {
    if (this.thinkingDurationSeconds !== null) return
    if (this.thinkingStartedAt === null || !this.thinking.trim()) return
    this.thinkingDurationSeconds = Math.round((Date.now() - this.thinkingStartedAt) / 1000)
  }

  getThinkingDurationSeconds(): number | null {
    return this.thinkingDurationSeconds
  }

  toContentBlocks(): ContentBlock[] {
    const blocks: ContentBlock[] = []

    if (this.thinking) {
      blocks.push({
        type: 'thinking',
        text: this.thinking,
        ...(this.thinkingDurationSeconds !== null
          ? { durationSeconds: this.thinkingDurationSeconds }
          : {}),
      })
    }

    if (this.kbSources.length > 0) {
      blocks.push({ type: 'kb_sources', sources: this.kbSources })
    }

    for (const tool of this.tools) {
      blocks.push({
        type: 'tool',
        toolCallId: tool.toolCallId,
        name: tool.name,
        arguments: tool.arguments,
        result: tool.result || undefined,
        status: tool.status,
      })
    }

    if (this.text || blocks.length === 0) {
      blocks.push({ type: 'text', text: this.text })
    }

    if (this.localFileLinks.length > 0) {
      blocks.push({
        type: 'local_file_links',
        title: '修订版文件（点击打开）',
        paths: this.localFileLinks,
      })
    }

    return blocks
  }

  plainText(): string {
    return this.text
  }
}
