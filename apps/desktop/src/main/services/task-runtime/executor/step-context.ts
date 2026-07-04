import { summarizeStepOutput, type AgentTask, type TaskStepRecord } from '@toolman/shared'

const PLACEHOLDER_CONTENT_RE = /^(path,type,name|name,type,path)\n?$/i
const PREV_OUTPUT_TOKEN = /\{\{\s*PREV(?:IOUS)?_STEP_OUTPUT\s*\}\}/gi

function resolveToolBaseName(toolName: string): string {
  return (toolName.includes('__') ? toolName.split('__').pop() : toolName)?.toLowerCase() ?? toolName.toLowerCase()
}

export function findPreviousCompletedToolStep(
  task: AgentTask,
  beforeStepId: string,
): TaskStepRecord | undefined {
  const stepIndex = task.history.findIndex((step) => step.id === beforeStepId)
  if (stepIndex <= 0) return undefined

  for (let index = stepIndex - 1; index >= 0; index -= 1) {
    const step = task.history[index]!
    if (step.kind === 'tool' && step.status === 'completed') {
      return step
    }
  }

  return undefined
}

export function summarizeStepOutputText(step: TaskStepRecord): string | undefined {
  return summarizeStepOutput(step.output)
}

function parseFsListOutput(text: string): Array<{ type: 'dir' | 'file'; name: string }> {
  const items: Array<{ type: 'dir' | 'file'; name: string }> = []
  for (const line of text.split('\n')) {
    const dirMatch = line.match(/^\[dir\]\s+(.+)$/)
    const fileMatch = line.match(/^\[file\]\s+(.+)$/)
    if (dirMatch?.[1]) {
      items.push({ type: 'dir', name: dirMatch[1].trim() })
    } else if (fileMatch?.[1]) {
      items.push({ type: 'file', name: fileMatch[1].trim() })
    }
  }
  return items
}

export function buildDirectoryCsvFromFsListOutput(text: string): string {
  const items = parseFsListOutput(text)
  const rows = ['path,type,name', ...items.map((item) => `.,${item.type},${item.name}`)]
  return `${rows.join('\n')}\n`
}

function isPlaceholderWriteContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return true
  if (PLACEHOLDER_CONTENT_RE.test(trimmed)) return true
  if (trimmed.length < 48 && trimmed.split('\n').length <= 2 && trimmed.split(',').length <= 4) {
    return true
  }
  return false
}

/** Inject prior tool output into args when planner used placeholders or fs_list → fs_write chains. */
export function injectStepContextIntoToolArgs(
  toolName: string,
  argsJson: string,
  previousOutput: string | undefined,
): string {
  if (!previousOutput?.trim()) return argsJson

  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>
  } catch {
    return argsJson
  }

  const base = resolveToolBaseName(toolName)

  if (typeof args.content === 'string' && PREV_OUTPUT_TOKEN.test(args.content)) {
    args.content = args.content.replace(PREV_OUTPUT_TOKEN, previousOutput)
    return JSON.stringify(args)
  }

  if (base === 'fs_write' || base === 'fs_edit') {
    const content = typeof args.content === 'string' ? args.content : ''
    const prevLooksLikeList = /^\[(?:dir|file)\]/m.test(previousOutput)
    if (prevLooksLikeList && isPlaceholderWriteContent(content)) {
      args.content = buildDirectoryCsvFromFsListOutput(previousOutput)
      return JSON.stringify(args)
    }
  }

  return argsJson
}
