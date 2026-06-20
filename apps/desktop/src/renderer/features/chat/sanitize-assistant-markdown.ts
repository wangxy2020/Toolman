import { splitPathParts } from './parse-tool-result'

export const LOCAL_FILE_LINK_SCHEME = 'toolman-local://'

export function buildLocalDocxMarkdownLink(path: string): string {
  const { name } = splitPathParts(path)
  return `[${name}](${LOCAL_FILE_LINK_SCHEME}${encodeURIComponent(path)})`
}

export function buildDocxFileLinksMarkdown(paths: readonly string[]): string {
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  if (unique.length === 0) return ''

  return [
    '## 修订版文件（点击打开）',
    '',
    ...unique.map((path) => `- ${buildLocalDocxMarkdownLink(path)}`),
    '',
  ].join('\n')
}

const FAKE_TOOL_CODE_RE = /<\s*tool_code\s*>[\s\S]*?<\s*\/\s*tool_code\s*>/gi
const FAKE_MCP_CODE_BLOCK_RE = /```[^\n]*\n[\s\S]*?\bmcp__[\s\S]*?```/gi
const FAKE_MCP_CALL_LINE_RE = /^\s*mcp__[\w-]+__[\w_]+\([\s\S]*?\)\s*$/gm
const PLACEHOLDER_FILE_LINK_RE = /\[可点击(?:的)?(?:带批注)?文件链接\]/g
const PLACEHOLDER_FILE_LINK_LINE_RE = /文件链接：?\s*(?:\[可点击[^\]]*\]|（[^）]*）)?/g
const RELATIVE_DOCX_LINK_RE =
  /\[([^\]]+\.docx)\]\((?!toolman-local:|\/|[A-Za-z]:|https?:|file:)[^)]+\)/gi
const LOCALHOST_DOCX_LINK_RE =
  /\[([^\]]+\.docx)\]\((https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/[^)]+)\)/gi
const REVISION_FILE_INLINE_LINK_RE = /(修订版文件[：:]\s*)\[[^\]]+\]\([^)]+\)/g

const UNIX_DOCX_PATH_RE = /(?<![[(<])(\/(?:[^\s[\]()<>,"']+\/)*[^\s[\]()<>,"']+\.docx)(?![\])>])/gi
const WIN_DOCX_PATH_RE =
  /(?<![[(<])([A-Za-z]:\\(?:[^\s[\]()<>,"']+\\)*[^\s[\]()<>,"']+\.docx)(?![\])>])/gi

export function sanitizeAssistantMarkdown(text: string): string {
  let result = text
    .replace(FAKE_TOOL_CODE_RE, '')
    .replace(FAKE_MCP_CODE_BLOCK_RE, '')
    .replace(FAKE_MCP_CALL_LINE_RE, '')
    .replace(PLACEHOLDER_FILE_LINK_RE, '')
    .replace(PLACEHOLDER_FILE_LINK_LINE_RE, '')
    .replace(REVISION_FILE_INLINE_LINK_RE, '$1见下方链接')
    .replace(LOCALHOST_DOCX_LINK_RE, '$1')
    .replace(RELATIVE_DOCX_LINK_RE, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  result = linkifyLocalDocxPaths(result)
  return result
}

export function linkifyLocalDocxPaths(text: string): string {
  return linkifyDocxPathsWithPattern(
    linkifyDocxPathsWithPattern(text, UNIX_DOCX_PATH_RE),
    WIN_DOCX_PATH_RE,
  )
}

function linkifyDocxPathsWithPattern(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match, path: string, offset: number, whole: string) => {
    const before = whole.slice(Math.max(0, offset - 2), offset)
    if (before === '](') return match
    if (before === '`' || whole[offset - 1] === '`') return match

    return buildLocalDocxMarkdownLink(path)
  })
}
