import { splitPathParts } from './parse-tool-result'

export const LOCAL_FILE_LINK_SCHEME = 'toolman-local://'

export function buildLocalDocxMarkdownLink(path: string): string {
  const { name } = splitPathParts(path)
  return `[${name}](${LOCAL_FILE_LINK_SCHEME}${encodeURIComponent(path)})`
}

export function buildLocalOfficeFileMarkdownLink(path: string): string {
  return buildLocalDocxMarkdownLink(path)
}

const UNIX_OFFICE_PATH_RE =
  /(?<![[(<])(\/(?:[^\s[\]()<>,"']+\/)*[^\s[\]()<>,"']+\.(?:docx?|xlsx?|csv|pdf))(?![\])>])/gi
const WIN_OFFICE_PATH_RE =
  /(?<![[(<])([A-Za-z]:\\(?:[^\s[\]()<>,"']+\\)*[^\s[\]()<>,"']+\.(?:docx?|xlsx?|csv|pdf))(?![\])>])/gi

const FAKE_TOOL_CODE_RE = /<\s*tool_code\s*>[\s\S]*?<\s*\/\s*tool_code\s*>/gi
const DSML_TOOL_CALLS_BLOCK_RE =
  /<[｜|]{1,2}DSML[｜|]{1,2}tool_calls>[\s\S]*?<\/[｜|]{1,2}DSML[｜|]{1,2}tool_calls>/gi
const DSML_FRAGMENT_RE = /<[｜|]{1,2}DSML[｜|]{1,2}[\s\S]*?<\/[｜|]{1,2}DSML[｜|]{1,2}[^>\s]+>/gi
const FAKE_MCP_CODE_BLOCK_RE = /```[^\n]*\n[\s\S]*?\bmcp__[\s\S]*?```/gi
const FAKE_MCP_CALL_LINE_RE = /^\s*mcp__[\w-]+__[\w_]+\([\s\S]*?\)\s*$/gm
const PLACEHOLDER_FILE_LINK_RE = /\[可点击(?:的)?(?:带批注)?文件链接\]/g
const PLACEHOLDER_FILE_LINK_LINE_RE = /文件链接：?\s*(?:\[可点击[^\]]*\]|（[^）]*）)?/g
const RELATIVE_DOCX_LINK_RE =
  /\[([^\]]+\.docx)\]\((?!toolman-local:|\/|[A-Za-z]:|https?:|file:)[^)]+\)/gi
const RELATIVE_OFFICE_LINK_RE =
  /\[([^\]]+\.(?:docx?|xlsx?|csv|pdf))\]\((?!toolman-local:\/\/(?:\/|[A-Za-z]:|%2F|%5C)|\/|[A-Za-z]:|https?:|file:)[^)]+\)/gi
const RELATIVE_TOOLMAN_LOCAL_LINK_RE =
  /\[([^\]]+\.(?:docx?|xlsx?|csv|pdf))\]\(toolman-local:\/\/(?![A-Za-z]:|%2F|%5C)[^)]+\)/gi
/** 模型常把修订版链到 dev server（含无路径的 http://localhost:5173），须剥掉以免点开空白页 */
const LOCALHOST_DOCX_LINK_RE =
  /\[([^\]]+\.docx)\]\((https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^)]*)?)\)/gi
const REVISION_FILE_INLINE_LINK_RE =
  /(\*{0,2}修订版文件\*{0,2}[：:]\s*)\[[^\]]+\]\([^)]+\)/g

const UNIX_DOCX_PATH_RE = /(?<![[(<])(\/(?:[^\s[\]()<>,"']+\/)*[^\s[\]()<>,"']+\.docx)(?![\])>])/gi
const WIN_DOCX_PATH_RE =
  /(?<![[(<])([A-Za-z]:\\(?:[^\s[\]()<>,"']+\\)*[^\s[\]()<>,"']+\.docx)(?![\])>])/gi

export function stripOfficeFileMarkdownLinks(text: string): string {
  return text
    .replace(RELATIVE_TOOLMAN_LOCAL_LINK_RE, '$1')
    .replace(RELATIVE_OFFICE_LINK_RE, '$1')
    .replace(RELATIVE_DOCX_LINK_RE, '$1')
    .replace(/[`'"]/g, '')
}

export function sanitizeAssistantMarkdown(
  text: string,
  options?: { trim?: boolean },
): string {
  let result = text
    .replace(DSML_TOOL_CALLS_BLOCK_RE, '')
    .replace(DSML_FRAGMENT_RE, '')
    .replace(FAKE_TOOL_CODE_RE, '')
    .replace(FAKE_MCP_CODE_BLOCK_RE, '')
    .replace(FAKE_MCP_CALL_LINE_RE, '')
    .replace(PLACEHOLDER_FILE_LINK_RE, '')
    .replace(PLACEHOLDER_FILE_LINK_LINE_RE, '')
    .replace(REVISION_FILE_INLINE_LINK_RE, '$1见下方链接')
    .replace(LOCALHOST_DOCX_LINK_RE, '$1')
    .replace(RELATIVE_TOOLMAN_LOCAL_LINK_RE, '$1')
    .replace(RELATIVE_OFFICE_LINK_RE, '$1')
    .replace(RELATIVE_DOCX_LINK_RE, '$1')
    .replace(/\n{3,}/g, '\n\n')

  if (options?.trim !== false) {
    result = result.trim()
  }

  result = linkifyLocalOfficePaths(result)
  return result
}

export function linkifyLocalDocxPaths(text: string): string {
  return linkifyLocalOfficePaths(text)
}

export function linkifyLocalOfficePaths(text: string): string {
  let linked = linkifyPathsWithPattern(text, UNIX_OFFICE_PATH_RE)
  linked = linkifyPathsWithPattern(linked, WIN_OFFICE_PATH_RE)
  linked = linkifyPathsWithPattern(linked, UNIX_DOCX_PATH_RE)
  linked = linkifyPathsWithPattern(linked, WIN_DOCX_PATH_RE)
  return linked
}

function isInsideMarkdownLinkUrl(text: string, offset: number): boolean {
  const before = text.slice(0, offset)
  const linkStart = before.lastIndexOf('](')
  if (linkStart < 0) return false

  const urlStart = linkStart + 2
  const closeIdx = text.indexOf(')', urlStart)
  if (closeIdx < 0) return true

  return offset < closeIdx
}

function linkifyPathsWithPattern(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match, path: string, offset: number, whole: string) => {
    if (isInsideMarkdownLinkUrl(whole, offset)) return match

    const before = whole.slice(Math.max(0, offset - 2), offset)
    if (before === '](') return match
    if (before === '`' || whole[offset - 1] === '`') return match

    return buildLocalOfficeFileMarkdownLink(path)
  })
}
