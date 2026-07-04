import { sanitizeAssistantMarkdown } from './sanitize-assistant-markdown'

/** Close unclosed markdown constructs so partial stream text renders like the final output. */
export function stabilizeIncompleteMarkdown(text: string): string {
  let result = text

  const codeFences = result.match(/```/g)
  if (codeFences && codeFences.length % 2 === 1) {
    result += '\n```'
  }

  const mathBlocks = result.match(/\$\$/g)
  if (mathBlocks && mathBlocks.length % 2 === 1) {
    result += '\n$$'
  }

  return result
}

export function prepareStreamingMarkdown(text: string, sanitize = false): string {
  const base = sanitize ? sanitizeAssistantMarkdown(text, { trim: false }) : text
  return stabilizeIncompleteMarkdown(base)
}
