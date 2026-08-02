import type { ContentBlock, KnowledgeCitation, StreamDelta } from '@toolman/shared'

type DocxReviewSummaryBlock = Extract<ContentBlock, { type: 'docx_review_summary' }>

type ToolBuffer = {
  toolCallId: string
  name: string
  arguments?: string
  result: string
  status: 'running' | 'done' | 'failed'
}

const PREPARING_STATUS_LINE = /^(正在准备|正在连接|正在读取|正在执行|等待|修订版)/

export class MessageStreamBuffers {
  private text = ''
  private thinking = ''
  private thinkingStartedAt: number | null = null
  private thinkingDurationSeconds: number | null = null
  private kbSources: KnowledgeCitation[] = []
  private docxReviewSummaries: DocxReviewSummaryBlock[] = []
  private localFileLinks: string[] = []
  private readonly tools: ToolBuffer[] = []

  appendText(chunk: string): void {
    if (chunk) {
      this.stripPreparingStatusFromThinking()
      if (this.thinking.trim()) {
        this.finalizeThinkingDuration()
      }
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
    if (!chunk) return
    this.stripPreparingStatusFromThinking()
    if (this.thinkingStartedAt === null) {
      this.thinkingStartedAt = Date.now()
    }
    this.thinking += chunk
  }

  stripPreparingStatusFromThinking(): void {
    if (!this.thinking) return
    const lines = this.thinking.split('\n')
    const kept = lines.filter((line) => {
      const trimmed = line.trim()
      return trimmed && !PREPARING_STATUS_LINE.test(trimmed)
    })
    if (kept.length === lines.filter((line) => line.trim()).length) return
    this.thinking = kept.join('\n')
    // Keep thinkingStartedAt so the clock measures real wait/think time, not just
    // the brief window when reasoning tokens are painted in the UI.
  }

  clearThinking(): void {
    // Clear visible thinking text for a new phase (e.g. docx summary), but keep the
    // original wall-clock start so duration does not shrink to only the last segment.
    this.thinking = ''
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

  setDocxReviewSummaries(summaries: DocxReviewSummaryBlock[]): void {
    this.docxReviewSummaries = summaries
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
    if (this.thinkingStartedAt === null || !this.thinking.trim()) return
    const elapsed = Math.max(0, Math.round((Date.now() - this.thinkingStartedAt) / 1000))
    // Allow duration to grow across phases (status → tools/review → final answer).
    // Never shrink once a longer wall-clock value was observed.
    this.thinkingDurationSeconds =
      this.thinkingDurationSeconds === null
        ? elapsed
        : Math.max(this.thinkingDurationSeconds, elapsed)
  }

  getThinkingDurationSeconds(): number | null {
    return this.thinkingDurationSeconds
  }

  getThinkingStartedAtMs(): number | null {
    return this.thinkingStartedAt
  }

  /** Live elapsed seconds while thinking is in progress (null if not started). */
  getLiveThinkingElapsedSeconds(): number | null {
    if (this.thinkingDurationSeconds !== null) return this.thinkingDurationSeconds
    if (this.thinkingStartedAt === null) return null
    return Math.max(0, Math.round((Date.now() - this.thinkingStartedAt) / 1000))
  }

  toContentBlocks(): ContentBlock[] {
    const blocks: ContentBlock[] = []

    if (this.thinking) {
      blocks.push({
        type: 'thinking',
        text: this.thinking,
        ...(this.thinkingStartedAt !== null ? { startedAtMs: this.thinkingStartedAt } : {}),
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

    for (const summary of this.docxReviewSummaries) {
      blocks.push(summary)
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

  replacePlainText(next: string): void {
    this.text = next
  }

  plainText(): string {
    return this.text
  }
}
