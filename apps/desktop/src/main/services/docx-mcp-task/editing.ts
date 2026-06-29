import {
  DOCX_MAX_CONTINUE_NUDGES,
  DOCX_MIN_EDITS_BEFORE_FINISH,
  DOCX_MIN_IDLE_ROUNDS_TO_FINISH,
} from './constants'

export function buildDocxContinueEditNudge(options: {
  successfulEdits: number
  nudgeIndex: number
  thorough: boolean
  workingPaths: string[]
}): string {
  const paths = options.workingPaths.map((path) => `- ${path}`).join('\n')
  const minEdits = options.thorough ? DOCX_MIN_EDITS_BEFORE_FINISH : 1

  if (options.successfulEdits < minEdits) {
    return [
      `当前仅完成 ${options.successfulEdits} 处 DOCX 编辑，未达到本次任务要求（至少 ${minEdits} 次编辑类工具调用）。`,
      '请继续编辑修订版文件，不要开始写最终总结：',
      '1. 优先用 add_comments 一次批量添加所有批注（不要只加一条）',
      '2. 用 replace_text 修正其余错误；仅当用户明确要求整段重写/列表化/重组段落时才用 edit_paragraphs',
      '3. 所有工具的 file_path 必须使用修订版绝对路径',
      '4. 勿重复 read_document',
      paths ? `修订版路径：\n${paths}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '请确认是否还有未处理的审查项、批注或文字错误。',
    '若仍有遗漏，请继续调用 add_comments / replace_text / edit_paragraphs；',
    '若已全部完成，可直接给出最终说明与修订版文件绝对路径。',
    '勿重复 read_document 或重做已完成步骤。',
    paths ? `修订版路径：\n${paths}` : '',
  ]
      .filter(Boolean)
      .join('\n')
}

export function shouldContinueDocxEditing(options: {
  thorough: boolean
  successfulEdits: number
  idleRoundsWithoutTools: number
  continueNudgesSent: number
}): boolean {
  if (options.continueNudgesSent >= DOCX_MAX_CONTINUE_NUDGES) return false

  const minEdits = options.thorough ? DOCX_MIN_EDITS_BEFORE_FINISH : 1
  if (options.successfulEdits < minEdits) return true

  if (options.thorough && options.idleRoundsWithoutTools < DOCX_MIN_IDLE_ROUNDS_TO_FINISH) {
    return true
  }

  return false
}
