import type { ToolDefinition } from '@toolman/model-gateway'

import { findDocxMcpToolName } from './docx-mcp-task.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import {
  buildCommentAnchorAttemptOrder,
  buildCommentAnchorCandidates,
  buildCommentSearchSeeds,
  collectAnchorsFromBlockText,
  normalizeAnchorText,
} from './docx-review-anchors'
import { parseReadDocumentBlockLine } from './docx-review-parsers'
import { MAX_COMMENT_SEARCH_SEEDS } from './docx-review-types'

function extractSearchTextPayload(result: string): {
  matches?: Array<{ blockIndex?: number; fullText?: string; context?: string }>
} | null {
  const jsonMatch = result.match(/<json>\s*([\s\S]*?)\s*<\/json>/i)
  if (!jsonMatch?.[1]) return null
  try {
    return JSON.parse(jsonMatch[1]) as {
      matches?: Array<{ blockIndex?: number; fullText?: string; context?: string }>
    }
  } catch {
    return null
  }
}

function stripContextEllipsis(context: string): string {
  return normalizeAnchorText(context.replace(/^\.\.\./, '').replace(/\.\.\.$/, ''))
}

async function readDocumentBlockText(options: {
  workingPath: string
  blockIndex: number
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<string | null> {
  const readTool = findDocxMcpToolName(options.tools, 'read_document')
  if (!readTool) return null

  try {
    const result = await executeToolCall(
      readTool,
      JSON.stringify({
        file_path: options.workingPath,
        start_paragraph: options.blockIndex,
        end_paragraph: options.blockIndex + 1,
      }),
      options.toolContext,
    )

    for (const line of result.split('\n')) {
      const parsed = parseReadDocumentBlockLine(line)
      if (parsed?.blockIndex === options.blockIndex) {
        return parsed.text
      }
    }
  } catch {
    return null
  }

  return null
}

async function collectVerifiedCommentAnchors(options: {
  workingPath: string
  searchQueries: readonly string[]
  paragraphIndex?: number
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<Set<string>> {
  const verified = new Set<string>()
  const searchTool = findDocxMcpToolName(options.tools, 'search_text')
  if (!searchTool) return verified

  if (options.paragraphIndex != null && options.paragraphIndex >= 0) {
    const blockText = await readDocumentBlockText({
      workingPath: options.workingPath,
      blockIndex: options.paragraphIndex,
      tools: options.tools,
      toolContext: options.toolContext,
    })
    if (blockText) {
      for (const query of options.searchQueries) {
        for (const anchor of collectAnchorsFromBlockText(blockText, query)) {
          verified.add(anchor)
        }
      }
    }
  }

  for (const query of options.searchQueries) {
    if (query.length < 2) continue

    try {
      const result = await executeToolCall(
        searchTool,
        JSON.stringify({
          file_path: options.workingPath,
          query,
          case_sensitive: false,
        }),
        options.toolContext,
      )
      if (/no matches found/i.test(result)) continue

      const payload = extractSearchTextPayload(result)
      const matches = payload?.matches ?? []

      for (const match of matches.slice(0, 3)) {
        if (match.context) {
          const context = stripContextEllipsis(match.context)
          for (const anchor of collectAnchorsFromBlockText(context, query)) {
            verified.add(anchor)
          }
        }

        if (match.fullText) {
          for (const anchor of collectAnchorsFromBlockText(match.fullText, query)) {
            verified.add(anchor)
          }
        }

        if (match.blockIndex != null) {
          const blockText = await readDocumentBlockText({
            workingPath: options.workingPath,
            blockIndex: match.blockIndex,
            tools: options.tools,
            toolContext: options.toolContext,
          })
          if (blockText) {
            for (const anchor of collectAnchorsFromBlockText(blockText, query)) {
              verified.add(anchor)
            }
          }
        }
      }
    } catch {
      // try next query seed
    }
  }

  return verified
}

export async function resolveCommentAnchorCandidates(options: {
  workingPath: string
  anchorText: string
  paragraphIndex?: number
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<string[]> {
  const strict = buildCommentAnchorCandidates(options.anchorText)
  const searchSeeds = buildCommentSearchSeeds(options.anchorText).slice(0, MAX_COMMENT_SEARCH_SEEDS)

  const verified = await collectVerifiedCommentAnchors({
    workingPath: options.workingPath,
    searchQueries: searchSeeds,
    paragraphIndex: options.paragraphIndex,
    tools: options.tools,
    toolContext: options.toolContext,
  })

  return buildCommentAnchorAttemptOrder({
    anchorText: options.anchorText,
    strictCandidates: strict,
    verifiedAnchors: verified,
  })
}

export async function resolveCommentAnchorText(options: {
  workingPath: string
  anchorText: string
  paragraphIndex?: number
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<string> {
  const candidates = await resolveCommentAnchorCandidates(options)
  return candidates[0] ?? options.anchorText
}
