/**
 * 工作 1 / 4 / 5 共用工作区根目录 `log.txt`：保存用户与大模型的定制说明，优先于内置快捷短语。
 * 执行过程账本各自独立（如 ipc_process_log.txt、ipc_payment_log.txt、boq_format_process_log.txt）。
 */

export const EPC_WORK4_WORKFLOW_LOG_FILE = 'log.txt'

export type EpcWorkflowWorkKind = 'work1' | 'work2' | 'work4' | 'work5'

export const EPC_WORKFLOW_LOG_HEADER = `# EPC 工作流定制说明（优先于内置快捷短语；本地引擎与智能体汇报须遵循）
# 以 "# ---" 开头的段落为历次追加记录。清空本文件可恢复仅使用快捷短语默认说明。
`

const LOG_SECTION_PREFIX = '# ---'

/** 从用户发送正文中剥离快捷短语、斜杠命令与结构化附加行，得到本次补充说明 */
export const extractWorkflowInputOverride = (
  rawText: string,
  quickPhraseContent: string,
  options?: {
    quickPhraseTitle?: string
    stripCommandLines?: RegExp
  }
): string | null => {
  let text = rawText.trim().replace(/\r\n/g, '\n')
  if (!text) {
    return null
  }

  const quick = quickPhraseContent.trim()
  if (quick && text.includes(quick)) {
    text = text.replace(quick, '').trim()
  }

  const title = options?.quickPhraseTitle?.trim()
  if (title && text.includes(title)) {
    text = text.replace(title, '').trim()
  }

  const lines = text.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      continue
    }
    if (options?.stripCommandLines?.test(t)) {
      continue
    }
    if (/^期数[:：]/i.test(t)) {
      continue
    }
    if (/^(?:母表|master)[:：]/i.test(t)) {
      continue
    }
    if (/^\/epc\s+/i.test(t)) {
      continue
    }
    kept.push(line)
  }

  const merged = kept.join('\n').trim()
  if (merged.length < 8) {
    return null
  }
  return merged
}

/** 读取 log.txt 时仅取定制正文（去掉文件头注释行，保留 # --- 段落内容） */
export const parseWorkflowLogOverrides = (fileContent: string): string => {
  const lines = fileContent.split(/\r?\n/)
  const body: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      body.push('')
      continue
    }
    if (t.startsWith('#') && !t.startsWith(LOG_SECTION_PREFIX)) {
      continue
    }
    body.push(line)
  }
  return body.join('\n').trim()
}

/**
 * 合并快捷短语、工作区 log.txt 与本次输入的补充说明。
 * 优先级：本次输入 > log.txt 历史 > 快捷短语默认正文。
 */
export const buildEffectiveWorkflowUserRequest = (
  quickPhraseContent: string,
  logOverride: string | null | undefined,
  inputOverride: string | null | undefined
): string => {
  const base = quickPhraseContent.trim()
  const fromLog = logOverride?.trim() ? parseWorkflowLogOverrides(logOverride) : ''
  const fromInput = inputOverride?.trim() ?? ''

  const sections: string[] = [base]

  if (fromLog) {
    sections.push(
      '\n\n## 工作区 log.txt 定制说明（优先于以上默认说明，运行时须遵循，勿被快捷短语覆盖）\n\n' +
        fromLog
    )
  }

  if (fromInput) {
    sections.push(
      '\n\n## 本次用户补充说明（优先于默认说明与历史 log.txt）\n\n' + fromInput
    )
  }

  return sections.join('')
}

export const formatWorkflowLogAppendBlock = (content: string, isoTimestamp?: string): string => {
  const ts = isoTimestamp ?? new Date().toISOString()
  return `\n\n${LOG_SECTION_PREFIX} ${ts} 用户/大模型定制 ---\n${content.trim()}\n`
}

export const workflowLogPathForWork = (workspaceRoot: string, _work: EpcWorkflowWorkKind): string => {
  const root = workspaceRoot.replace(/\/+$/, '')
  return `${root}/${EPC_WORK4_WORKFLOW_LOG_FILE}`
}

const normalizePathKey = (p: string): string =>
  p
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase()

/** Write/Edit 是否指向工作区根目录 `log.txt`（工作 1 / 4 / 5 共用） */
export const isEpcWorkflowLogFilePath = (filePath: string, workspaceRoot: string): boolean => {
  if (!filePath.trim() || !workspaceRoot.trim()) {
    return false
  }
  const raw = filePath.trim().replace(/\\/g, '/')
  const target = normalizePathKey(
    raw.startsWith('/') || /^[a-zA-Z]:/.test(raw) ? raw : `${workspaceRoot.replace(/\\/g, '/')}/${raw}`
  )
  const logPath = normalizePathKey(workflowLogPathForWork(workspaceRoot, 'work4'))
  return target === logPath
}
