export const toolApprovalPageZhCN = {
  title: {
    default: '工具调用授权',
    docxBatch: 'Word 文档编辑授权',
    excelBatch: 'Excel 表格编辑授权',
  },
  queueHint: '待处理 {{count}} 项',
  batchHint: {
    excel:
      '本次将调用 modify_excel_cells / highlight_excel_cells 写入修订版。允许后，本次任务内后续 Excel 编辑工具将自动执行，不再逐项询问。',
    docx:
      '本次将依次调用多个 DOCX 编辑工具（批注、替换、段落修改等）。允许后，本次任务内后续 DOCX 工具将自动执行，不再逐项询问。',
  },
} as const
