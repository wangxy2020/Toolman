const SENTENCE_END = /([。！？!?；;…]|\.(?=\s|$)|!(?=\s|$)|(?:\?(?=\s|$)))/
const FORCE_BREAK_CHARS = 80

/**
 * Streaming sentence splitter: buffer LLM text deltas and emit complete sentences.
 * Flush remaining buffer on stream end (message.done).
 */
export class TtsSentenceSplitter {
  private buffer = ''

  append(chunk: string): string[] {
    if (!chunk) return []
    this.buffer += chunk
    return this.drainReady()
  }

  /** Emit any leftover text (final flush). */
  flush(): string[] {
    const rest = this.buffer.trim()
    this.buffer = ''
    return rest ? [rest] : []
  }

  reset(): void {
    this.buffer = ''
  }

  private drainReady(): string[] {
    const out: string[] = []
    while (this.buffer.length > 0) {
      const match = SENTENCE_END.exec(this.buffer)
      if (match && match.index != null) {
        const end = match.index + match[0].length
        const sentence = this.buffer.slice(0, end).trim()
        this.buffer = this.buffer.slice(end)
        if (sentence) out.push(sentence)
        continue
      }

      // Force-split long runs without punctuation (comma / newline preferred).
      if (this.buffer.length >= FORCE_BREAK_CHARS) {
        const window = this.buffer.slice(0, FORCE_BREAK_CHARS)
        const soft =
          Math.max(window.lastIndexOf('，'), window.lastIndexOf(','), window.lastIndexOf('\n')) + 1
        const cut = soft > 12 ? soft : FORCE_BREAK_CHARS
        const sentence = this.buffer.slice(0, cut).trim()
        this.buffer = this.buffer.slice(cut)
        if (sentence) out.push(sentence)
        continue
      }
      break
    }
    return out
  }
}
