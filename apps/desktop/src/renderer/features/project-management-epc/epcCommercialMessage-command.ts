/** epc <ipcx|ipc4|schx-ipc4> to boq */
const EPC_COMMAND_LINE_PATTERN = /^epc\s+(\S+)\s+to\s+boq\s*$/i

/** 旧版：epc <project_id> <schx-ipcx> to boq */
const LEGACY_EPC_COMMAND_LINE_PATTERN = /^epc\s+\S+\s+(schx-ipc[\w-]+)\s+to\s+boq\s*$/i

const PLACEHOLDER_IPC_TOKENS = new Set(['ipcx', 'schx-ipcx', 'ipc_x', 'ipc-x'])

/** 将命令中的 IPC 令牌解析为期数列名（如 IPC4） */
export const ipcTokenToPeriod = (ipcToken: string): string | undefined => {
  const token = ipcToken.trim()
  if (!token || PLACEHOLDER_IPC_TOKENS.has(token.toLowerCase())) {
    return undefined
  }

  const schxMatch = token.match(/^schx-ipc([\w-]+)$/i)
  if (schxMatch?.[1]) {
    const suffix = schxMatch[1].replace(/-/g, '').toUpperCase()
    return suffix ? `IPC${suffix}` : undefined
  }

  const plainMatch = token.match(/^ipc[_-]?(\d+)$/i)
  if (plainMatch?.[1]) {
    return `IPC${plainMatch[1]}`
  }

  if (/^ipc[\w-]+$/i.test(token)) {
    const suffix = token.replace(/^ipc/i, '').replace(/-/g, '').toUpperCase()
    return suffix ? `IPC${suffix}` : undefined
  }

  return undefined
}

export const normalizeEpcSlashCommandInput = (command: string): string => {
  const firstLine = command.trim().split('\n')[0]?.trim().replace(/^\//, '') ?? ''
  const legacy = firstLine.match(LEGACY_EPC_COMMAND_LINE_PATTERN)
  if (legacy?.[1]) {
    const ipcToken = legacy[1].replace(/^schx-/i, '')
    return `epc ${ipcToken} to boq`
  }
  return firstLine
}

/** 解析工作 4 执行命令（可在多行正文中任意一行） */
export const parseEpcCommercialCommandInput = (
  rawText: string
): { matched: boolean; period?: string; masterPricePath?: string; usesPlaceholders?: boolean } => {
  const lines = rawText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let ipcToken: string | undefined
  for (const line of lines) {
    const normalized = normalizeEpcSlashCommandInput(line)
    const match = normalized.match(EPC_COMMAND_LINE_PATTERN)
    if (match) {
      ipcToken = match[1]
      break
    }
  }

  if (!ipcToken) {
    return { matched: false }
  }

  const period = ipcTokenToPeriod(ipcToken)
  const usesPlaceholders = PLACEHOLDER_IPC_TOKENS.has(ipcToken.toLowerCase())

  let masterPricePath: string | undefined
  for (const line of lines) {
    const masterMatch = line.match(/^(?:母表[:：]\s*)(.+)$/i)
    if (masterMatch) {
      masterPricePath = masterMatch[1].trim()
    }
  }

  return {
    matched: true,
    period,
    masterPricePath,
    usesPlaceholders
  }
}
